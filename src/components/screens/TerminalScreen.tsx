"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Terminal as TermIcon, Circle, Wifi, WifiOff, RotateCcw, FileText, Loader2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { useTerminal } from "@/hooks/use-terminal";
import { TERMINAL_THEMES, TERMINAL_THEME_KEY, TERMINAL_THEME_EVENT, readTerminalTheme } from "./SettingsScreen";

const TERMINAL_STATE_KEY = "hokma.terminal.state.v1";
const HISTORY_MAX = 200;

type TerminalState = { activeSessionId: string; history: string[]; updatedAt: string };

function readTerminalState(key: string): TerminalState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<TerminalState>;
    if (!Array.isArray(p.history)) return null;
    return {
      activeSessionId: typeof p.activeSessionId === "string" ? p.activeSessionId : "pty-1",
      history: p.history.filter((l): l is string => typeof l === "string").slice(-HISTORY_MAX),
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : "",
    };
  } catch { /* ignore */ }
  return null;
}

function writeTerminalState(key: string, activeSessionId: string, history: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify({
      activeSessionId,
      history: history.slice(-HISTORY_MAX),
      updatedAt: new Date().toISOString(),
    }));
  } catch { /* ignore */ }
}

// Serializa as últimas HISTORY_MAX linhas visíveis do buffer do xterm
function snapshotTerminalLines(term: Terminal): string[] {
  try {
    const buf = term.buffer.active;
    const n = buf.length;
    const start = Math.max(0, n - HISTORY_MAX);
    const lines: string[] = [];
    for (let y = start; y < n; y++) {
      const t = buf.getLine(y)?.translateToString(true);
      if (t !== undefined) lines.push(t);
    }
    return lines;
  } catch { /* ignore */ }
  return [];
}

const QUICK_DEFAULT = [
  "pwd", "ls -la", "whoami", "uptime",
  "df -h /sdcard", "free -h", "uname -r",
];
// ── FASE 5 — comandos rapidos customizaveis (persistidos em localStorage) ──
const QUICK_KEY = "hokma.terminal.quick.v1";
function readQuickCmds(): string[] {
  try {
    const raw = localStorage.getItem(QUICK_KEY);
    if (!raw) return [...QUICK_DEFAULT];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [...QUICK_DEFAULT];
    return arr.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 24);
  } catch { return [...QUICK_DEFAULT]; }
}

type ArmedMod = "none" | "ctrl" | "alt";
// BUG 3 — modificadores viram conjunto independente (toggle: tocar de novo
// desativa; Ctrl e Alt podem ficar ativos juntos p/ combinações Ctrl+Alt).
type ArmedMods = { ctrl: boolean; alt: boolean };
const NO_MODS: ArmedMods = { ctrl: false, alt: false };

// ── FASE 3 — tecla com gesto de swipe ──
// Swipe para CIMA na tecla aciona onSwipeUp; swipe para BAIXO aciona
// onSwipeDown; toque simples mantem o onClick normal. O preventDefault no
// touchend impede o click sintetico apos o gesto (React nao marca touchend
// como passive, entao funciona). Feedback visual: setinha ↑/↓ pisca no botao.
function SwipeKey({
  onSwipeUp,
  onSwipeDown,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}) {
  const yRef = useRef<number | null>(null);
  const firedRef = useRef<"up" | "down" | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      {...rest}
      className={cn(className, "relative touch-manipulation")}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          yRef.current = e.touches[0].clientY;
          firedRef.current = null;
        }
      }}
      onTouchMove={(e) => {
        if (yRef.current === null || firedRef.current) return;
        const dy = e.touches[0].clientY - yRef.current;
        if (dy <= -24) {
          firedRef.current = "up";
          setFlash("up");
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setFlash(null), 300);
          onSwipeUp?.();
        } else if (dy >= 24) {
          firedRef.current = "down";
          setFlash("down");
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setFlash(null), 300);
          onSwipeDown?.();
        }
      }}
      onTouchEnd={(e) => {
        if (firedRef.current) e.preventDefault(); // gesto consumido: sem click
        yRef.current = null;
      }}
    >
      {children}
      {flash && (
        <span
          className={cn(
            "pointer-events-none absolute left-1/2 -translate-x-1/2 text-[9px] font-bold",
            flash === "up" ? "-top-2" : "-bottom-2",
          )}
        >
          {flash === "up" ? "↑" : "↓"}
        </span>
      )}
    </button>
  );
}

// Remove sequências de escape ANSI (CSI/OSC/charset) deixando texto puro legível
// para o "modo leitura" (contexto completo das conversas do OpenCode/Claude).
const ANSI_RE = /\x1b\[[0-9;:?]*[\x20-\x2f]*[A-Za-z]|\x1bP[\x20-\x7e]*?\x1b\\|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[=>]|\x1b[NO]/g;
const stripAnsi = (t: string) => t.replace(ANSI_RE, "");
// Cap do log: ~400KB de texto puro (evita travar o mobile)
const LOG_MAX_CHARS = 400_000;

// BUG 1 — posição de scroll preservada ao minimizar/trocar de tela:
// map do módulo (sobrevive ao desmonte do componente) tabId -> viewportY.
const savedScrollY = new Map<string, number>();

// Mapeia tecla única (do teclado do sistema) para o código de controle Ctrl+<tecla>
function ctrlCode(data: string): string | null {
  if (data.length !== 1) return null;
  const code = data.charCodeAt(0);
  if (code >= 97 && code <= 122) return String.fromCharCode(code - 96); // a-z -> 1-26
  if (code >= 65 && code <= 90) return String.fromCharCode(code - 64); // A-Z
  switch (data) {
    case "[": return "\x1b"; // Ctrl+[ == Esc
    case "]": return "\x1d";
    case "\\": return "\x1c";
    case "^": return "\x1e";
    case "_": return "\x1f";
    case " ": return "\x00";
    case "?": return "\x7f";
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// FASE 6 — múltiplas sessões simultâneas (abas "Sessão 1/2/...").
// Cada aba é um TerminalTabBody: seu próprio xterm, seu WebSocket (via
// provider), seu scrollback, seu log do modo leitura e seu estado de TUI.
// O TerminalScreen (pai) mantém o header, a barra de abas, os comandos
// rápidos (globais) e a barra de teclas especiais (aponta para a aba ativa).
// ─────────────────────────────────────────────────────────────────────────

type TerminalTabBodyProps = {
  tabId: string;
  visible: boolean;
  armed: ArmedMods;
  armedRef: React.MutableRefObject<ArmedMods>;
  armedAtRef: React.MutableRefObject<number>;
  onArmedChange: (m: ArmedMods) => void;
  onTuiChange: (active: boolean) => void;
  everLiveRef: React.MutableRefObject<boolean>;
};

export type TerminalTabBodyHandle = {
  focus: () => void;
  openLog: () => void;
};

const TerminalTabBody = forwardRef<TerminalTabBodyHandle, TerminalTabBodyProps>(function TerminalTabBody(
  { tabId, visible, armed, armedRef, armedAtRef, onArmedChange, onTuiChange, everLiveRef },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termApi = useTerminal();
  const tab = termApi.tabs.find((t) => t.id === tabId);
  const conn = tab?.conn ?? "idle";
  const stateKey = TERMINAL_STATE_KEY + "." + tabId;
  // TUI ativa (OpenCode/Claude Code): ativa o "modo adaptativo" no Screen.
  const tuiActiveRef = useRef(false);
  const tuiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tuiActive, setTuiActiveState] = useState(false);
  const setTuiActive = (v: boolean) => {
    tuiActiveRef.current = v;
    setTuiActiveState(v);
    onTuiChange(v);
  };
  // Log de "contexto completo" (modo leitura)
  const logRef = useRef("");
  const showLogRef = useRef(false);
  const [showLog, setShowLog] = useState(false);
  const [logVersion, setLogVersion] = useState(0);
  const lastSnapRef = useRef("");
  // true enquanto o usuário está no fundo do buffer (digitando/stream ao vivo)
  const atBottomRef = useRef(true);
  // Métricas do buffer (viewportY/baseY) para a scrollbar customizada real.
  const [scrollInfo, setScrollInfo] = useState<{ v: number; b: number }>({ v: 0, b: 0 });
  const trackRef = useRef<HTMLDivElement>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 1º resize do mount é só visual: NÃO envia SIGWINCH ao pty — o bash
  // redesenha o prompt com setas (\x1b[A + \x1b[K) e apaga o scrollback
  // recém-escrito no reattach (multisessão: o timing expõe isso).
  const firstResizeRef = useRef(true);
  // Últimas dimensões ENVIADAS ao pty: o resize só é enviado quando o tamanho
  // muda de verdade (rotação/janela). Esconder+mostrar uma aba (hidden →
  // visible) dispara o ResizeObserver com o MESMO tamanho — enviar SIGWINCH
  // aí faz o bash redesenhar o prompt (\x1b[A + \x1b[K) e APAGA o histórico
  // no ring/scrollback do reattach.
  const lastResizeRef = useRef("");
  const scheduleResizeSend = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      resizeTimerRef.current = null;
      const t = termRef.current;
      const fit = fitRef.current;
      if (!t || !fit) return;
      try {
        fit.fit();
        const dims = fit.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          const key = dims.cols + "x" + dims.rows;
          if (lastResizeRef.current === key) return; // tamanho inalterado
          lastResizeRef.current = key;
          termApi.sendResize(tabId, dims.cols, dims.rows);
        }
      } catch { /* noop */ }
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  const writeToShell = useCallback((data: string) => termApi.write(tabId, data), [tabId]);
  // Posição de scroll a restaurar no próximo write (BUG 1)
  const pendingRestoreRef = useRef<number | null>(null);
  // Ref espelhado do visible (o onResize é closure do mount e o prop muda)
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || termRef.current) return;

    const savedY = savedScrollY.get(tabId);
    if (savedY !== undefined) pendingRestoreRef.current = savedY;

    const savedTheme = TERMINAL_THEMES[readTerminalTheme()] ?? TERMINAL_THEMES.dark;
    const term = new Terminal({
      fontSize: 12.5,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      cursorBlink: true,
      scrollback: 10000,
      theme: { ...savedTheme.theme },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // ── TUI (OpenCode/Claude Code) desenha no buffer PRINCIPAL ──
    // Alt screen (smcup/rmcup — Claude Code, vi, less, top): intercepta para
    // a TUI desenhar no buffer principal (scrollback + rolagem por swipe) e
    // marca TUI ativa (modo leitura com snapshots + modo adaptativo).
    const altModeIds = [1049, 1047, 47];
    term.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
      const mode = typeof params[0] === "number" ? params[0] : -1;
      if (altModeIds.includes(mode)) {
        setTuiActive(true);
        logRef.current = "";
        lastSnapRef.current = "";
        return true; // consome — TUI no buffer principal (com scrollback)
      }
      return false;
    });
    term.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
      const mode = typeof params[0] === "number" ? params[0] : -1;
      if (altModeIds.includes(mode)) {
        setTuiActive(false);
        return true;
      }
      return false;
    });

    // Rastreia se o usuário está no fundo do buffer: digitando/stream ao vivo
    const updateAtBottom = () => {
      try {
        const b = term.buffer.active;
        atBottomRef.current = b.viewportY >= b.baseY;
        setScrollInfo({ v: b.viewportY, b: b.baseY });
      } catch { atBottomRef.current = true; }
    };
    updateAtBottom();
    term.onScroll(() => { updateAtBottom(); });

    term.onData((data) => {
      // Input do usuário = voltou a interagir: sai do modo histórico
      if (!atBottomRef.current) {
        try { term.scrollToBottom(); } catch { /* noop */ }
      }
      const mods = armedRef.current;
      if (mods.ctrl || mods.alt) {
        const locked = Date.now() - armedAtRef.current < 350;
        const ctrlPart = mods.ctrl ? ctrlCode(data) : null;
        const altPart = mods.alt && data.length === 1 ? data : null;
        let out: string;
        if (mods.ctrl && mods.alt) {
          // Ctrl+Alt+tecla = ESC + Ctrl+tecla
          out = "\x1b" + (ctrlPart ?? altPart ?? data);
        } else if (mods.ctrl) {
          out = ctrlPart ?? data;
        } else {
          out = altPart ?? data;
        }
        // Lockout pós-armamento (~350ms): o refocus do teclado gera um evento
        // fantasma — aplica o modificador mas NÃO desarma.
        if (!locked) {
          armedRef.current = NO_MODS;
          armedAtRef.current = 0;
          onArmedChange(NO_MODS);
        }
        writeToShell(out);
        return;
      }
      writeToShell(data);
    });

    // Restaura o estado visual ao montar (mesma lógica da v1, por aba)
    const liveOnMount = conn === "live";
    if (liveOnMount) {
      const saved = readTerminalState(stateKey);
      if (saved && saved.history.length > 0) {
        term.write(saved.history.join("\r\n") + "\r\n");
      }
      const recent = termApi.getRecentOutput(tabId);
      if (recent) {
        term.write(recent);
      }
      if (pendingRestoreRef.current !== null) {
        const y = pendingRestoreRef.current;
        pendingRestoreRef.current = null;
        try { term.scrollToLine(Math.min(y, term.buffer.active.baseY)); } catch { /* noop */ }
      } else {
        term.scrollToBottom();
      }
    }

    // Output do PTY (socket global por aba)
    const onOutput = (text: string) => {
      const t = termRef.current;
      if (!t) return;
      // Detecção de TUI por cup (\x1b[<lin>;<col>H): OpenCode/Bubble Tea
      // desenham com posicionamento absoluto; o shell raramente usa cup.
      // Com debounce de saída: ~2.5s sem cup → volta ao modo shell.
      if (/\x1b\[\d+;\d+H/.test(text)) {
        if (!tuiActiveRef.current) {
          setTuiActive(true);
          logRef.current = "";
          lastSnapRef.current = "";
        }
        if (tuiTimerRef.current) clearTimeout(tuiTimerRef.current);
        tuiTimerRef.current = setTimeout(() => { setTuiActive(false); }, 2500);
      }
      try {
        t.write(text);
      } catch (e) {
      }
      // BUG 1 — restaura a posição de scroll salva (o histórico/scrollback foi
      // reescrito): aplica ANTES de qualquer auto-scroll.
      if (pendingRestoreRef.current !== null) {
        const y = pendingRestoreRef.current;
        pendingRestoreRef.current = null;
        try { t.scrollToLine(Math.min(y, t.buffer.active.baseY)); } catch { /* noop */ }
      } else if (atBottomRef.current) {
        // ROLAGEM MANUAL: só auto-rola quando o usuário está no fundo
        t.scrollToBottom();
      }
      // Modo leitura: stream bruto só fora de TUI (shell usa \n)
      if (!tuiActiveRef.current) {
        if (logRef.current.length + text.length > LOG_MAX_CHARS) {
          logRef.current = logRef.current.slice(Math.max(0, logRef.current.length - LOG_MAX_CHARS + text.length));
        }
        logRef.current += text;
        if (showLogRef.current) setLogVersion((v) => v + 1);
      }
    };
    const unsub = termApi.subscribeOutput(tabId, onOutput);

    // Quando a conexão abre de verdade (socket novo), avisa na tela
    const onLive = () => {
      everLiveRef.current = true;
      const t = termRef.current;
      if (t) {
        t.writeln("\r\n\x1b[32m● sessão PTY real iniciada\x1b[0m (Ctrl+D sai)");
        t.scrollToBottom();
      }
      const dims = fitRef.current?.proposeDimensions();
      if (dims && dims.cols > 0 && dims.rows > 0) {
        lastResizeRef.current = dims.cols + "x" + dims.rows;
        termApi.sendResize(tabId, dims.cols, dims.rows);
      }
    };
    const unsubLive = termApi.subscribeLive(tabId, onLive);

    // Snapshot incremental a cada 2s (por aba)
    const saveTimer = setInterval(() => {
      const t = termRef.current;
      if (!t) return;
      writeTerminalState(stateKey, tabId, snapshotTerminalLines(t));
    }, 2000);

    // Snapshot do RENDER para o modo leitura (TUI: stream bruto ilegível)
    const snapTimer = setInterval(() => {
      if (!tuiActiveRef.current) return;
      const rowsEl = host.querySelector<HTMLElement>(".xterm-rows");
      if (!rowsEl) return;
      const snap = rowsEl.innerText
        .split("\n")
        .filter((l) => {
          const t = l.trim();
          if (t === "") return false;
          const noise = (l.match(/[\u2800-\u28ff\u2500-\u257f\u2580-\u259f\u2b1d\u25a0-\u25a1\u2591-\u2593]/g) || []).length;
          return noise / Math.max(1, l.length) <= 0.6;
        })
        .join("\n");
      if (snap && snap !== lastSnapRef.current) {
        lastSnapRef.current = snap;
        if (logRef.current.length + snap.length > LOG_MAX_CHARS) {
          logRef.current = logRef.current.slice(Math.max(0, logRef.current.length - LOG_MAX_CHARS + snap.length));
        }
        logRef.current += "\n" + snap + "\n";
        if (showLogRef.current) setLogVersion((v) => v + 1);
      }
    }, 800);

    const onResize = () => {
      try {
        fit.fit();
        // Aba oculta: o host mede 0x0 e o fit propõe dimensões mínimas —
        // enviar esse resize ao pty (SIGWINCH) faz o bash redesenhar o prompt
        // (\x1b[A + \x1b[K) e APAGA o histórico no ring/scrollback do
        // reattach. Aba oculta NUNCA envia resize.
        if (!visibleRef.current) return;
        if (firstResizeRef.current) {
          firstResizeRef.current = false;
          const t = termRef.current;
          if (t && atBottomRef.current) t.scrollToBottom();
          return; // sem SIGWINCH no 1º mount: preserva o scrollback do reattach
        }
        scheduleResizeSend();
        const t = termRef.current;
        if (t && atBottomRef.current) t.scrollToBottom();
      } catch { /* noop */ }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    termApi.ensureConnected(tabId);
    return () => {
      clearInterval(saveTimer);
      clearInterval(snapTimer);
      if (tuiTimerRef.current) clearTimeout(tuiTimerRef.current);
      unsub();
      unsubLive();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      const t = termRef.current;
      if (t) {
        writeTerminalState(stateKey, tabId, snapshotTerminalLines(t));
        try { savedScrollY.set(tabId, t.buffer.active.viewportY); } catch { /* noop */ }
      }
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // ── BUG 1 — preserva a posição de scroll ao minimizar/voltar ──
  // visibilitychange: hidden → salva o viewportY; visible → restaura exato.
  useEffect(() => {
    const onVis = () => {
      const t = termRef.current;
      if (!t) return;
      if (document.hidden) {
        try { savedScrollY.set(tabId, t.buffer.active.viewportY); } catch { /* noop */ }
      } else {
        const y = savedScrollY.get(tabId);
        if (y !== undefined) {
          try { t.scrollToLine(Math.min(y, t.buffer.active.baseY)); } catch { /* noop */ }
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [tabId]);

  // ── FASE 4 — tema de cores (aplicado nesta aba + runtime) ──
  useEffect(() => {
    const apply = (key: string) => {
      const t = termRef.current;
      if (!t) return;
      const th = TERMINAL_THEMES[key] ?? TERMINAL_THEMES.dark;
      t.options.theme = { ...th.theme };
    };
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent).detail as { theme?: string } | undefined;
      if (d?.theme) apply(d.theme);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === TERMINAL_THEME_KEY) apply(e.newValue ?? "dark");
    };
    window.addEventListener(TERMINAL_THEME_EVENT, onEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TERMINAL_THEME_EVENT, onEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // ── Scroll por TOQUE (swipe) + FASE 2 long-press (copiar linha) ──
  const touchYRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [selMenu, setSelMenu] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopy = async () => {
    const sel = termRef.current?.getSelection() ?? "";
    try {
      await navigator.clipboard.writeText(sel);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => { setSelMenu(null); setCopied(false); }, 1400);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = sel;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => { setSelMenu(null); setCopied(false); }, 1400);
      } catch { setSelMenu(null); }
    }
  };
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onTouchStart = (e: TouchEvent) => {
      const menuEl = document.querySelector('[data-testid="sel-menu"]');
      if (menuEl && e.touches[0] && !menuEl.contains(e.target as Node)) setSelMenu(null);
      longPressFiredRef.current = false;
      const t = termRef.current;
      if (!t) return;
      if (e.touches.length === 1) {
        touchYRef.current = e.touches[0].clientY;
        touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
          const term = termRef.current;
          if (!term || !touchStartPosRef.current) return;
          const screen = host.querySelector<HTMLElement>(".xterm-screen");
          if (!screen) return;
          const rect = screen.getBoundingClientRect();
          if (rect.height <= 0 || term.rows <= 0) return;
          const row = Math.floor((touchStartPosRef.current.y - rect.top) / (rect.height / term.rows));
          if (row >= 0 && row < term.rows) {
            const b = term.buffer.active;
            const absRow = b ? b.baseY + row : row;
            longPressFiredRef.current = true;
            term.selectLines(absRow, absRow);
            const x = Math.max(8, Math.min(touchStartPosRef.current.x, window.innerWidth - 130));
            const y = Math.max(8, Math.min(touchStartPosRef.current.y, window.innerHeight - 90));
            setSelMenu({ x, y });
            setCopied(false);
          }
        }, 550);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartPosRef.current && e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartPosRef.current.x;
        const dy = e.touches[0].clientY - touchStartPosRef.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        }
      }
      const t = termRef.current;
      if (!t || touchYRef.current === null) return;
      const b = t.buffer.active;
      if (!b || b.baseY <= 0) { touchYRef.current = null; return; }
      const dy = e.touches[0].clientY - touchYRef.current;
      touchYRef.current = e.touches[0].clientY;
      if (dy !== 0) {
        const lines = Math.max(1, Math.min(4, Math.round(Math.abs(dy) / 10)));
        t.scrollLines(dy < 0 ? -lines : lines);
        e.preventDefault();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      touchYRef.current = null;
      touchStartPosRef.current = null;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };
    host.addEventListener("touchstart", onTouchStart, { passive: true });
    host.addEventListener("touchmove", onTouchMove, { passive: false });
    host.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      host.removeEventListener("touchstart", onTouchStart);
      host.removeEventListener("touchmove", onTouchMove);
      host.removeEventListener("touchend", onTouchEnd);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => { try { termRef.current?.textarea?.focus(); } catch { /* ignore */ } },
    openLog: () => { showLogRef.current = true; setShowLog(true); },
  }), []);

  // ── Scrollbar customizada real (buffer de 10000 linhas) ──
  const rows = termRef.current?.rows ?? 0;
  const totalLines = scrollInfo.b + rows;
  const thumbHeightPct = totalLines > 0
    ? Math.max(8, Math.min(100, (rows / totalLines) * 100))
    : 100;
  const thumbTopPct = scrollInfo.b > 0
    ? (scrollInfo.v / scrollInfo.b) * (100 - thumbHeightPct)
    : 0;
  const atBottom = scrollInfo.b === 0 || scrollInfo.v >= scrollInfo.b;
  const showScrollbar = scrollInfo.b > 0;

  const jumpTo = (clientY: number) => {
    const track = trackRef.current;
    const t = termRef.current;
    if (!track || !t) return;
    const b = t.buffer.active;
    if (!b || b.baseY <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const target = Math.round(ratio * b.baseY);
    t.scrollToLine(Math.max(0, Math.min(b.baseY, target)));
  };
  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    jumpTo(e.clientY);
  };
  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    jumpTo(e.clientY);
  };

  // Texto legível do modo leitura
  const logText = useMemo(() => {
    if (!showLog) return "";
    const clean = stripAnsi(logRef.current).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const NOISE = /[\u2800-\u28ff\u2500-\u257f\u2580-\u259f\u2b1d\u25a0-\u25a1\u2591-\u2593]/;
    const out: string[] = [];
    for (const line of clean.split("\n")) {
      if (line.trim() === "") {
        if (out.length > 0 && out[out.length - 1] !== "") out.push("");
        continue;
      }
      const noise = (line.match(NOISE) || []).length;
      if (noise / Math.max(1, line.length) > 0.6) continue;
      if (out.length > 0 && out[out.length - 1] === line) continue;
      out.push(line);
    }
    return out.join("\n") || "(sem saída ainda)";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLog, logVersion]);

  return (
    <div className={visible ? "relative flex min-h-0 flex-1 flex-col" : "hidden"}>
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="h-full w-full overflow-hidden px-1.5 py-1.5" />

        {showScrollbar && (
          <div
            ref={trackRef}
            className="absolute right-0.5 top-1.5 bottom-1.5 z-10 w-4 cursor-pointer touch-none select-none"
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            data-testid="term-scrollbar-track"
          >
            <div
              className="absolute left-0 mx-auto w-2 rounded-full bg-emerald-400/40 hover:bg-emerald-400/70"
              style={{ top: `${thumbTopPct}%`, height: `${thumbHeightPct}%` }}
            />
          </div>
        )}

        {showScrollbar && !atBottom && (
          <button
            type="button"
            onClick={() => termRef.current?.scrollToBottom()}
            className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-emerald-700/60 bg-[#0d1117]/95 px-3 py-1 text-[10px] font-mono text-emerald-300 shadow-lg backdrop-blur-sm"
            data-testid="term-back-to-live"
          >
            ↓ voltar ao live
          </button>
        )}
      </div>

      {/* FASE 2 — menu de copiar por long-press */}
      {selMenu && (
        <div data-testid="sel-menu"
          className="fixed z-50 rounded-xl border border-emerald-900/50 bg-[#0d1117]/95 px-2 py-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.55)] backdrop-blur-sm"
          style={{ left: selMenu.x, top: selMenu.y }}>
          <button type="button" onClick={handleCopy} data-testid="sel-copy"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-mono text-emerald-300 hover:bg-emerald-500/15">
            <FileText className="h-3 w-3" />
            {copied ? "Copiado ✓" : "Copiar linha"}
          </button>
        </div>
      )}

      {/* Modo leitura: contexto completo da conversa (por aba) */}
      {showLog && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117]">
          <div className="flex items-center justify-between border-b border-emerald-900/40 px-3 py-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-300/80">
              <FileText className="h-3.5 w-3.5" />
              Contexto completo · modo leitura
            </span>
            <button onClick={() => { showLogRef.current = false; setShowLog(false); }} data-testid="log-close"
              className="rounded-md border border-emerald-900/50 bg-emerald-500/5 px-2 py-1 text-emerald-300 hover:bg-emerald-500/10">
              ✕ Fechar
            </button>
          </div>
          <pre data-testid="log-body"
            className="thin-scroll min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-300">
            {logText}
          </pre>
        </div>
      )}
    </div>
  );
});

export function TerminalScreen() {
  const termApi = useTerminal();
  const { tabs, activeTabId, setActiveTab, addTab, removeTab, connect, write } = termApi;
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const conn = activeTab?.conn ?? "idle";
  const note = activeTab?.note ?? "";
  const bodyRefs = useRef<Map<string, TerminalTabBodyHandle>>(new Map());
  const everLiveRef = useRef(false);
  const armedRef = useRef<ArmedMods>(NO_MODS);
  const armedAtRef = useRef(0);
  const [armed, setArmed] = useState<ArmedMods>(NO_MODS);
  const [kbInset, setKbInset] = useState(0);
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  const [tuiStates, setTuiStates] = useState<Record<string, boolean>>({});
  const tuiActive = !!tuiStates[activeTabId];
  const writeActive = useCallback((data: string) => write(activeTabId, data), [write, activeTabId]);

  const onTuiChange = useCallback((id: string) => (active: boolean) => {
    setTuiStates((prev) => (prev[id] === active ? prev : { ...prev, [id]: active }));
  }, []);

  // ── FASE 5 — comandos rapidos (globais, aplicam na aba ativa) ──
  const [quickCmds, setQuickCmds] = useState<string[]>(readQuickCmds);
  const [editingQuick, setEditingQuick] = useState(false);
  const [newQuick, setNewQuick] = useState("");
  useEffect(() => {
    try { localStorage.setItem(QUICK_KEY, JSON.stringify(quickCmds)); } catch { /* noop */ }
  }, [quickCmds]);
  const addQuick = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = newQuick.trim();
    if (!cmd) return;
    setQuickCmds((c) => [...c, cmd]);
    setNewQuick("");
  };
  const removeQuick = (i: number) => setQuickCmds((c) => c.filter((_, idx) => idx !== i));
  const moveQuick = (i: number, dir: -1 | 1) => setQuickCmds((c) => {
    const j = i + dir;
    if (j < 0 || j >= c.length) return c;
    const n = [...c];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const resetQuick = () => setQuickCmds([...QUICK_DEFAULT]);

  // ── Modificadores sticky (Ctrl/Alt) — globais, apontam p/ aba ativa ──
  const refocusTerminal = () => {
    bodyRefs.current.get(activeTabId)?.focus();
  };
  const clearMods = () => {
    armedRef.current = NO_MODS;
    setArmed(NO_MODS);
    refocusTerminal();
  };
  // BUG 3 — toggle verdadeiro: tocar de novo no MESMO botão desativa; Ctrl e
  // Alt são independentes (podem ficar ativos juntos p/ Ctrl+Alt).
  const toggleMod = (mod: "ctrl" | "alt") => {
    const next: ArmedMods = { ...armedRef.current, [mod]: !armedRef.current[mod] };
    armedRef.current = next;
    armedAtRef.current = Date.now();
    setArmed(next);
    refocusTerminal();
  };
  const pressCtrl = () => toggleMod("ctrl");
  const pressAlt = () => toggleMod("alt");
  const pressCtrlC = () => { clearMods(); writeActive("\x03"); };
  const pressCtrlD = () => { clearMods(); writeActive("\x04"); };
  const pressEsc = () => { clearMods(); writeActive("\x1b"); };
  const pressTab = () => { clearMods(); writeActive("\x09"); };
  const pressArrow = (dir: "up" | "down" | "left" | "right") => {
    clearMods();
    writeActive(dir === "up" ? "\x1b[A" : dir === "down" ? "\x1b[B" : dir === "right" ? "\x1b[C" : "\x1b[D");
  };
  const swipePress = (fn: () => void) => () => { fn(); refocusTerminal(); };
  const swipeCtrlUp = swipePress(() => { clearMods(); writeActive("\x03"); });
  const swipeCtrlDown = swipePress(() => { clearMods(); writeActive("\x04"); });
  const swipeAltUp = swipePress(() => { clearMods(); writeActive("\x1b\x07"); });
  const swipeAltDown = swipePress(() => { clearMods(); writeActive("\x1a"); });
  const swipeEscUp = swipePress(() => { clearMods(); writeActive("\x0c"); });
  const swipeEscDown = swipePress(() => { clearMods(); writeActive("\x12"); });
  const swipeUpUp = swipePress(() => { clearMods(); writeActive("\x1b[5~"); });
  const swipeDownDown = swipePress(() => { clearMods(); writeActive("\x1b[6~"); });

  // Acompanha o teclado virtual (Android): ancorar a barra + modo adaptativo
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVV = () => {
      // BUG 2 — altura do teclado = innerHeight - vv.height - vv.offsetTop
      // (offsetTop: o visualViewport desloca quando o teclado abre). Sem
      // margem extra: a barra fica PERFEITAMENTE colada no topo do teclado.
      const inset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      setKbInset(inset);
      setVvHeight(inset > 0 ? Math.max(0, vv.height) : null);
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    return () => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
    };
  }, []);

  // FASE 1 — status de conexao explicito da ABA ATIVA
  const statusColor = conn === "live" ? "#22c55e" : conn === "connecting" ? "#f59e0b" : "#ef4444";
  const statusLabel = conn === "live" ? "LIVE"
    : conn === "connecting"
      ? (everLiveRef.current ? "Reconectando…" : "Conectando…")
      : "Desconectado";
  const showKeysBar = kbInset > 0;
  const adaptiveHeight = tuiActive && kbInset > 0 ? vvHeight : null;

  const keyBase = "flex h-11 min-w-[44px] shrink-0 select-none items-center justify-center rounded-xl border px-2 text-[10px] font-mono transition-colors active:scale-95";
  const keyIdle = "border-emerald-900/50 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/15";
  const keyActive = "border-emerald-300 bg-emerald-400 text-emerald-950 font-bold ring-2 ring-emerald-300/80 shadow-[0_0_14px_rgba(52,211,153,0.7)]";

  return (
    <div
      className="relative flex h-full flex-col bg-[#0d1117] pb-36 font-mono text-emerald-400"
      style={adaptiveHeight !== null ? { height: `${adaptiveHeight}px` } : undefined}
    >
      {/* Header: título + status da aba ativa + modo leitura + reconectar */}
      <div className="flex items-center justify-between border-b border-emerald-900/40 px-3 py-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-emerald-300/80">
          <TermIcon className="h-3.5 w-3.5" />
          HOK Server · shell interativo (PTY)
        </span>
        <div className="flex items-center gap-2">
          {conn === "live"
            ? <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            : <WifiOff className="h-3.5 w-3.5 text-red-400" />}
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{ background: `${statusColor}20`, color: statusColor }}>
            {conn === "connecting"
              ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
              : <Circle className="h-2 w-2" style={{ fill: statusColor }} />}
            {statusLabel}
          </span>
          <button onClick={() => bodyRefs.current.get(activeTabId)?.openLog()} title="Ver contexto completo (modo leitura)"
            className="rounded-md border border-emerald-900/50 bg-emerald-500/5 p-1 text-emerald-300 hover:bg-emerald-500/10">
            <FileText className="h-3.5 w-3.5" />
          </button>
          {conn === "offline" && (
            <button onClick={() => connect(activeTabId)} title="Reconectar"
              className="rounded-md border border-emerald-900/50 bg-emerald-500/5 p-1 text-emerald-300 hover:bg-emerald-500/10">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* FASE 6 — barra de abas (múltiplas sessões) */}
      <div className="flex items-center gap-1 border-b border-emerald-900/40 px-2 py-1.5" data-testid="term-tabbar">
        {tabs.map((tab, i) => (
          <div key={tab.id} className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`term-tab-${i + 1}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                tab.id === activeTabId
                  ? "border-emerald-400 bg-emerald-400/15 text-emerald-200"
                  : "border-emerald-900/40 text-emerald-300/60 hover:bg-emerald-500/10",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", tab.conn === "live" ? "bg-emerald-400" : tab.conn === "connecting" ? "bg-amber-400" : "bg-red-400")} />
              Sessão {i + 1}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={() => removeTab(tab.id)}
                data-testid={`term-tab-close-${i + 1}`}
                className="-ml-1 rounded-full p-0.5 text-[10px] text-emerald-300/50 hover:text-red-300"
                aria-label={`Fechar sessão ${i + 1}`}
              >✕</button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addTab}
          data-testid="term-tab-add"
          className="ml-auto rounded-lg border border-emerald-900/50 px-2 py-1 text-[12px] text-emerald-300 hover:bg-emerald-500/10"
          title="Nova sessão"
        >+</button>
      </div>

      {note && (
        <div className="border-b border-red-900/40 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-300">{note}</div>
      )}

      {/* FASE 5 — comandos rapidos (globais) */}
      <div className="border-b border-emerald-900/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {quickCmds.map((q) => (
            <button key={q} onClick={() => writeActive(q + "\r")}
              className="rounded-md border border-emerald-900/50 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10">
              {q.length > 18 ? q.slice(0, 16) + "…" : q}
            </button>
          ))}
          <button type="button" onClick={() => setEditingQuick((v) => !v)} data-testid="quick-edit"
            className={cn("rounded-md border px-2 py-1 text-[11px]",
              editingQuick ? "border-emerald-300 bg-emerald-400 text-emerald-950" : "border-emerald-900/50 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10")}>
            {editingQuick ? "✕ Fechar" : "✎ Editar"}
          </button>
        </div>

        {editingQuick && (
          <div className="mt-2 space-y-1.5" data-testid="quick-editor">
            {quickCmds.map((q, i) => (
              <div key={q + "-" + i} className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate rounded-md border border-emerald-900/40 bg-emerald-500/5 px-2 py-1 font-mono text-[11px] text-emerald-300">{q}</span>
                <button type="button" onClick={() => moveQuick(i, -1)} data-testid={`quick-up-${i}`}
                  className="rounded border border-emerald-900/50 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10">↑</button>
                <button type="button" onClick={() => moveQuick(i, 1)} data-testid={`quick-down-${i}`}
                  className="rounded border border-emerald-900/50 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10">↓</button>
                <button type="button" onClick={() => removeQuick(i)} data-testid={`quick-del-${i}`}
                  className="rounded border border-red-900/50 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10">✕</button>
              </div>
            ))}
            <form onSubmit={addQuick} className="flex gap-1.5">
              <input
                value={newQuick}
                onChange={(e) => setNewQuick(e.target.value)}
                placeholder="comando (ex: git status)"
                data-testid="quick-new-input"
                className="min-w-0 flex-1 rounded-md border border-emerald-900/40 bg-[#0d1117] px-2 py-1 font-mono text-[11px] text-emerald-300 outline-none focus:border-emerald-500/60"
              />
              <button type="submit" data-testid="quick-add"
                className="rounded-md border border-emerald-900/50 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20">+ Adicionar</button>
            </form>
            <button type="button" onClick={resetQuick} data-testid="quick-reset"
              className="rounded-md border border-emerald-900/50 px-2 py-1 text-[10px] text-emerald-300/70 hover:bg-emerald-500/10">
              ↺ Restaurar padrão
            </button>
          </div>
        )}
      </div>

      {/* FASE 6 — corpos das sessões (um xterm por aba; inativas ficam ocultas) */}
      {tabs.map((tab) => (
        <TerminalTabBody
          key={tab.id}
          ref={(el) => {
            if (el) bodyRefs.current.set(tab.id, el);
            else bodyRefs.current.delete(tab.id);
          }}
          tabId={tab.id}
          visible={tab.id === activeTabId}
          armed={armed}
          armedRef={armedRef}
          armedAtRef={armedAtRef}
          onArmedChange={setArmed}
          onTuiChange={onTuiChange(tab.id)}
          everLiveRef={everLiveRef}
        />
      ))}

      {/* ── Barra de teclas especiais (mobile) — accessory view do teclado ── */}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 px-2"
        style={{ bottom: showKeysBar ? kbInset : -72, transition: "bottom 0.18s ease" }}
        data-testid="special-keys-bar"
      >
        <div className="pointer-events-auto thin-scroll mx-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-emerald-900/50 bg-[#0d1117]/95 px-2 py-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.55)] backdrop-blur-sm">
          <SwipeKey type="button" onClick={pressCtrl}
            onSwipeUp={swipeCtrlUp} onSwipeDown={swipeCtrlDown} data-testid="key-ctrl"
            className={cn(keyBase, "active:bg-emerald-400 active:text-emerald-950", armed.ctrl ? keyActive : keyIdle)}>Ctrl</SwipeKey>
          <SwipeKey type="button" onClick={pressAlt}
            onSwipeUp={swipeAltUp} onSwipeDown={swipeAltDown} data-testid="key-alt"
            className={cn(keyBase, "active:bg-emerald-400 active:text-emerald-950", armed.alt ? keyActive : keyIdle)}>Alt</SwipeKey>
          <SwipeKey type="button" onClick={pressEsc}
            onSwipeUp={swipeEscUp} onSwipeDown={swipeEscDown} data-testid="key-esc"
            className={cn(keyBase, keyIdle)}>Esc</SwipeKey>
          <SwipeKey type="button" onClick={pressTab} data-testid="key-tab"
            className={cn(keyBase, keyIdle)}>Tab</SwipeKey>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          <button type="button" onClick={pressCtrlC} data-testid="key-ctrlc"
            className={cn(keyBase, keyIdle, "text-red-300")}>Ctrl<span className="ml-0.5 text-[9px]">C</span></button>
          <button type="button" onClick={pressCtrlD} data-testid="key-ctrld"
            className={cn(keyBase, keyIdle, "text-red-300")}>Ctrl<span className="ml-0.5 text-[9px]">D</span></button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          <SwipeKey type="button" onClick={() => pressArrow("up")}
            onSwipeUp={swipeUpUp} onSwipeDown={swipeDownDown} data-testid="key-up"
            className={cn(keyBase, keyIdle)} aria-label="Seta para cima"><ArrowUp className="h-4 w-4" /></SwipeKey>
          <SwipeKey type="button" onClick={() => pressArrow("down")}
            onSwipeUp={swipeUpUp} onSwipeDown={swipeDownDown} data-testid="key-down"
            className={cn(keyBase, keyIdle)} aria-label="Seta para baixo"><ArrowDown className="h-4 w-4" /></SwipeKey>
          <button type="button" onClick={() => pressArrow("left")} data-testid="key-left"
            className={cn(keyBase, keyIdle)} aria-label="Seta para a esquerda"><ArrowLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => pressArrow("right")} data-testid="key-right"
            className={cn(keyBase, keyIdle)} aria-label="Seta para a direita"><ArrowRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
