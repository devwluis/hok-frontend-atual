"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function readTerminalState(): TerminalState | null {
  try {
    const raw = localStorage.getItem(TERMINAL_STATE_KEY);
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

function writeTerminalState(activeSessionId: string, history: string[]) {
  try {
    localStorage.setItem(TERMINAL_STATE_KEY, JSON.stringify({
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

export function TerminalScreen() {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const armedRef = useRef<ArmedMod>("none");
  const armedAtRef = useRef(0);
  const { conn, note, connect, ensureConnected, write, sendResize, subscribeOutput, subscribeLive, getRecentOutput } = useTerminal();
  const [armed, setArmed] = useState<ArmedMod>("none");
  const [kbInset, setKbInset] = useState(0);
  // Área visível (px) quando o teclado virtual está aberto (null = fechado).
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  // TUI ativa (OpenCode/Claude Code detectado via smcup/rmcup interceptado):
  // ativa o "modo adaptativo" — com teclado aberto, o terminal encolhe para a
  // área visível acima do teclado (diálogo/input sempre à vista).
  const everLiveRef = useRef(false);
  const tuiActiveRef = useRef(false);
  const tuiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tuiActive, setTuiActive] = useState(false);
  // Log de "contexto completo" (modo leitura): texto puro de TUDO que passou
  // pelo pty — o scrollback do xterm não acumula os redraws das TUIs
  // (OpenCode/Claude sobrescrevem a tela), então este log é a única forma de
  // rolar e ler a conversa inteira.
  const logRef = useRef("");
  const showLogRef = useRef(false);
  const [showLog, setShowLog] = useState(false);
  const [logVersion, setLogVersion] = useState(0);
  // Último snapshot renderizado da TUI (para dedup no modo leitura)
  const lastSnapRef = useRef("");
  // true enquanto o usuário está no fundo do buffer (digitando/stream ao vivo);
  // false quando rolou pra cima de propósito (modo histórico — NÃO forçar scroll).
  const atBottomRef = useRef(true);
  // Métricas do buffer (viewportY/baseY) para a scrollbar customizada real.
  const [scrollInfo, setScrollInfo] = useState<{ v: number; b: number }>({ v: 0, b: 0 });
  const trackRef = useRef<HTMLDivElement>(null);
  // Resize do pty: debounce curto (~150ms) para não floodar o WebSocket em
  // mudanças reais de tamanho (rotação da tela / redimensionamento da janela).
  // O teclado virtual NÃO dispara mais isso — a barra de teclas é uma accessory
  // view fixa acima do teclado e o terminal permanece intacto (estratégia Termius).
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        if (dims && dims.cols > 0 && dims.rows > 0) sendResize(dims.cols, dims.rows);
      } catch { /* noop */ }
    }, 350);
  }, [sendResize]);

  const writeToShell = (data: string) => write(data);

  // ── FASE 5 — edicao dos comandos rapidos ──
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

  // ── Modificadores sticky (Ctrl/Alt) para teclado touch ──
  // Sempre refoca a textarea do xterm após tocar a barra: o toque num botão
  // roubaria o foco e fecharia o teclado virtual — refocar mantém o teclado
  // aberto e captura a próxima tecla do teclado do sistema.
  const refocusTerminal = () => {
    try { termRef.current?.textarea?.focus(); } catch { /* ignore */ }
  };
  const setMod = (mod: ArmedMod) => {
    armedRef.current = mod;
    armedAtRef.current = Date.now();
    setArmed(mod);
    refocusTerminal();
  };
  const pressCtrl = () => setMod("ctrl");
  const pressAlt = () => setMod("alt");
  const pressCtrlC = () => { setMod("none"); writeToShell("\x03"); };
  const pressCtrlD = () => { setMod("none"); writeToShell("\x04"); };
  const pressEsc = () => { setMod("none"); writeToShell("\x1b"); };
  const pressTab = () => { setMod("none"); writeToShell("\x09"); };
  const pressArrow = (dir: "up" | "down" | "left" | "right") => {
    setMod("none");
    writeToShell(dir === "up" ? "\x1b[A" : dir === "down" ? "\x1b[B" : dir === "right" ? "\x1b[C" : "\x1b[D");
  };

  // ── FASE 3 — mapeamento dos gestos de swipe nas teclas especiais ──
  // Ctrl ↑ → Ctrl+C (interromper) · Ctrl ↓ → Ctrl+D (EOF)
  // Alt  ↑ → Ctrl+Alt+G (atalho do terminal/OpenCode) · Alt ↓ → Ctrl+Z (suspende)
  // Esc  ↑ → Ctrl+L (limpa tela) · Esc ↓ → Ctrl+R (reverse-search do bash)
  // ↑ (seta)  ↑ → PageUp · ↓ (seta) ↓ → PageDown (rolar TUIs/OpenCode)
  const swipePress = (fn: () => void) => () => { fn(); refocusTerminal(); };
  const swipeCtrlUp = swipePress(() => { setMod("none"); writeToShell("\x03"); });
  const swipeCtrlDown = swipePress(() => { setMod("none"); writeToShell("\x04"); });
  const swipeAltUp = swipePress(() => { setMod("none"); writeToShell("\x1b\x07"); });
  const swipeAltDown = swipePress(() => { setMod("none"); writeToShell("\x1a"); });
  const swipeEscUp = swipePress(() => { setMod("none"); writeToShell("\x0c"); });
  const swipeEscDown = swipePress(() => { setMod("none"); writeToShell("\x12"); });
  const swipeUpUp = swipePress(() => { setMod("none"); writeToShell("\x1b[5~"); });
  const swipeDownDown = swipePress(() => { setMod("none"); writeToShell("\x1b[6~"); });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || termRef.current) return;

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
    // TUIs usam o alternate screen buffer (smcup/rmcup), que NÃO tem
    // scrollback — por isso a rolagem (swipe/scrollbar) não funcionava dentro
    // das conversas. Intercepta as sequências de alt screen: a TUI desenha no
    // buffer normal, tudo vai pro scrollback e o swipe rola a conversa inteira.
    // O flag tuiActive alimenta o "modo adaptativo" (container encolhe com o
    // teclado aberto para o diálogo caber na área visível).
    // Detecção de TUI ativa (OpenCode/Claude Code): o OpenCode NÃO usa o alt
    // screen (desenha com cup no buffer principal) — ele sinaliza a TUI com o
    // kitty keyboard protocol (?2026h/l). O Claude/vi/less usam o alt screen
    // (?1049h/l, ?1047h/l, ?47h/l), que interceptamos para a TUI desenhar no
    // buffer principal (scrollback). Ambos alimentam o flag tuiActive:
    // - snapshots do render no modo leitura (stream bruto é ilegível, cup sem \n)
    // - modo adaptativo: com teclado aberto, o terminal encolhe p/ área visível.
    // Alt screen (smcup/rmcup — Claude Code, vi, less, top): intercepta para
    // a TUI desenhar no buffer principal (scrollback + rolagem por swipe) e
    // marca TUI ativa (modo leitura com snapshots + modo adaptativo).
    const altModeIds = [1049, 1047, 47];
    term.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
      const mode = typeof params[0] === "number" ? params[0] : -1;
      if (altModeIds.includes(mode)) {
        tuiActiveRef.current = true;
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
        tuiActiveRef.current = false;
        setTuiActive(false);
        return true;
      }
      return false;
    });

    // Rastreia se o usuário está no fundo do buffer: digitando/stream ao vivo
    // (viewportY == baseY) ou rolado pra cima (modo histórico). Usado para
    // NÃO forçar scrollToBottom quando o usuário rolou de propósito — o
    // auto-scroll do teclado só age na digitação ativa.
    const updateAtBottom = () => {
      try {
        const b = term.buffer.active;
        atBottomRef.current = b.viewportY >= b.baseY;
        setScrollInfo({ v: b.viewportY, b: b.baseY });
      } catch { atBottomRef.current = true; }
    };
    updateAtBottom();
    term.onScroll(() => {
      updateAtBottom();
      // Ao voltar pro fundo (scrollToBottom manual via gesto/barra), nada a fazer.
    });

    term.onData((data) => {
      // Input do usuário = voltou a interagir: sai do modo histórico e volta
      // ao fundo (comportamento padrão de terminais — digitação abandona a
      // rolagem manual).
      if (!atBottomRef.current) {
        try { term.scrollToBottom(); } catch { /* noop */ }
      }
      const mod = armedRef.current;
      if (mod !== "none") {
        // Lockout pós-armamento: ao tocar Ctrl/Alt o refocus reabre o teclado
        // virtual no mobile e o teclado emite um evento fantasma para a textarea
        // nos primeiros ~350ms — esse evento NÃO deve desarmar o modificador.
        // Passa o dado adiante (se for vazio, é no-op no shell) e mantém armado.
        if (Date.now() - armedAtRef.current < 350) {
          // Aplica o modificador se a tecla for mapeável, mas NÃO desarma:
          // evento fantasma do teclado no refocus é inócuo, tecla rápida real
          // ainda recebe Ctrl/Alt.
          if (mod === "ctrl") {
            const code = ctrlCode(data);
            if (code) { writeToShell(code); return; }
          } else if (mod === "alt") {
            if (data.length === 1) { writeToShell("\x1b" + data); return; }
          }
          writeToShell(data);
          return;
        }
        // Desarma sempre após a próxima tecla (comportamento "sticky one-shot")
        armedRef.current = "none";
        armedAtRef.current = 0;
        setArmed("none");
        if (mod === "ctrl") {
          const code = ctrlCode(data);
          if (code) { writeToShell(code); return; }
        } else if (mod === "alt") {
          if (data.length === 1) { writeToShell("\x1b" + data); return; }
        }
      }
      writeToShell(data);
    });

    // Restaura o estado visual ao montar:
    // - Se o socket JÁ está vivo (troca de aba com TerminalProvider ativo):
    //   restaura histórico do localStorage + output recente do provider.
    // - Se é conexão nova (refresh/reabrir navegador/reconexão): o servidor
    //   envia o scrollback persistente na mensagem de controle — não duplicar
    //   com o histórico local.
    const liveOnMount = conn === "live";
    if (liveOnMount) {
      const saved = readTerminalState();
      if (saved && saved.history.length > 0) {
        term.write(saved.history.join("\r\n") + "\r\n");
      }
      const recent = getRecentOutput();
      if (recent) {
        term.write(recent);
        term.scrollToBottom();
      }
    }

    // Output do PTY vem do provider global (socket sobrevive à troca de abas).
    const onOutput = (text: string) => {
      const t = termRef.current;
      if (!t) return;
      // Detecção de TUI por cup (\x1b[<lin>;<col>H): TUIs (OpenCode/Bubble
      // Tea) desenham com posicionamento absoluto; o shell raramente usa cup.
      // Com debounce de saída: ~2.5s sem cup → volta ao modo shell.
      if (/\x1b\[\d+;\d+H/.test(text)) {
        if (!tuiActiveRef.current) {
          tuiActiveRef.current = true;
          setTuiActive(true);
          // Descarta o log bruto pré-TUI (embaralhado por cup) — a conversa
          // entra no log pelos snapshots do render (próximo tick do snapTimer).
          logRef.current = "";
          lastSnapRef.current = "";
        }
        if (tuiTimerRef.current) clearTimeout(tuiTimerRef.current);
        tuiTimerRef.current = setTimeout(() => {
          tuiActiveRef.current = false;
          setTuiActive(false);
        }, 2500);
      }
      t.write(text);
      // ROLAGEM MANUAL: só auto-rola quando o usuário está no fundo do buffer
      // (digitando/stream ao vivo). Se rolou pra cima de propósito (modo
      // histórico), o output novo NÃO empurra o viewport — ele permanece onde
      // o usuário parou, mesmo com redraws da TUI/spinner do OpenCode.
      if (atBottomRef.current) t.scrollToBottom();
      // Modo leitura: o stream bruto só é útil fora de TUI (shell usa \n);
      // com TUI ativa o log vem dos snapshots do render (cup não preserva
      // linhas no stream).
      if (!tuiActiveRef.current) {
        if (logRef.current.length + text.length > LOG_MAX_CHARS) {
          logRef.current = logRef.current.slice(Math.max(0, logRef.current.length - LOG_MAX_CHARS + text.length));
        }
        logRef.current += text;
        if (showLogRef.current) setLogVersion((v) => v + 1);
      }
    };
    const unsub = subscribeOutput(onOutput);

    // Quando a conexão abre de verdade (socket novo), avisa na tela e
    // reenvia o resize (o tamanho do terminal pode ter mudado).
    const onLive = () => {
      everLiveRef.current = true;
      const t = termRef.current;
      if (t) {
        t.writeln("\r\n\x1b[32m● sessão PTY real iniciada\x1b[0m (Ctrl+D sai)");
        t.scrollToBottom();
      }
      const dims = fitRef.current?.proposeDimensions();
      if (dims) sendResize(dims.cols, dims.rows);
    };
    const unsubLive = subscribeLive(onLive);

    // Snapshot incremental a cada 2s (não depende de unload da página,
    // que pode não disparar ao fechar a aba em mobile).
    const saveTimer = setInterval(() => {
      const t = termRef.current;
      if (!t) return;
      writeTerminalState("pty-1", snapshotTerminalLines(t));
    }, 2000);

    // Snapshot do RENDER para o modo leitura: com TUI ativa (OpenCode/Claude),
    // o stream bruto do pty não preserva linhas (a TUI desenha com cup, sem
    // \n) — o xterm renderiza corretamente, então capturamos o texto VISUAL
    // (.xterm-rows) e adicionamos ao log quando a tela muda (dedup por
    // snapshot). Sem TUI o log bruto já é suficiente (shell com \n).
    const snapTimer = setInterval(() => {
      if (!tuiActiveRef.current) return;
      const rowsEl = host.querySelector<HTMLElement>(".xterm-rows");
      if (!rowsEl) return;
      // Normaliza: remove linhas de ruído (spinner/bordas) e linhas vazias —
      // assim os redraws de frames com o spinner girando não geram snapshots.
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
        // fit visual imediato (redesenha o xterm); envio do resize ao pty é
        // debounced via scheduleResizeSend (150ms). Só dispara em mudança real
        // de tamanho (rotação/redimensionamento da janela) — o teclado virtual
        // NÃO chega aqui (o terminal mantém o tamanho cheio; a barra de teclas
        // é fixed e não afeta o layout).
        fit.fit();
        scheduleResizeSend();
        // Auto-scroll do redimensionamento SÓ quando o usuário está no fundo
        // (digitando ativamente). Se rolou pra cima de propósito (modo
        // histórico), preserva a posição — não briga com o scroll manual.
        const t = termRef.current;
        if (t && atBottomRef.current) t.scrollToBottom();
      } catch { /* noop */ }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // Conexão no mount: o provider global mantém o socket vivo ao trocar de
    // aba. ensureConnected reaproveita a MESMA sessão se o socket ainda
    // estiver OPEN/CONNECTING (sem derrubar o shell); só abre um novo quando
    // não há conexão ativa (primeira vez / queda real). FIX 20/08: chamar
    // connect() aqui derrubava o socket vivo e resetava a sessão.
    ensureConnected();
    return () => {
      clearInterval(saveTimer);
      clearInterval(snapTimer);
      if (tuiTimerRef.current) clearTimeout(tuiTimerRef.current);
      unsub();
      unsubLive();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      const t = termRef.current;
      if (t) writeTerminalState("pty-1", snapshotTerminalLines(t)); // save final no unmount
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── FASE 4 — tema de cores do terminal (dark / solarized / alto contraste) ──
  // Lido do localStorage no mount e atualizado em runtime via CustomEvent
  // (disparado pelo seletor nas Configurações) — xterm.options.theme reaplica.
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

  // Acompanha a borda superior do teclado virtual (Android) via visualViewport:
  // window.innerHeight - vv.height = altura do teclado (kbInset). Usado SÓ para
  // ancorar a barra de teclas como "input accessory view" (position: fixed com
  // bottom = kbInset), replicando o comportamento do Termius: a barra gruda
  // imediatamente acima do teclado, fixa e estável, e desce/some quando ele fecha.
  // NÃO redimensiona o terminal nem dispara resize do pty — o conteúdo do xterm
  // permanece intacto (evita o desalinhamento da TUI do OpenCode).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVV = () => {
      const inset = Math.max(0, window.innerHeight - vv.height);
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

  // ── Scroll por TOQUE (swipe) no mobile ──
  // O DOM renderer do xterm v6 não rola por gesto de arrastar no celular (o
  // wheel/fit funcionam, mas o touch não). Aqui o arrasto vertical na área do
  // terminal é convertido em scrollLines — o MESMO mecanismo do wheel que já
  // funciona. Listeners NATIVOS com passive:false (o React marca touchmove
  // como passive e o preventDefault seria ignorado).
  const touchYRef = useRef<number | null>(null);
  // ── FASE 2 — long-press para copiar texto (selecao por linha) ──
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
      // Fallback: execCommand (http/localhost sem permissao de clipboard)
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
      // Qualquer toque fecha o menu de selecao (a menos que o toque seja nele)
      const menuEl = document.querySelector('[data-testid="sel-menu"]');
      if (menuEl && e.touches[0] && !menuEl.contains(e.target as Node)) setSelMenu(null);
      longPressFiredRef.current = false;
      const t = termRef.current;
      if (!t) return;
      if (e.touches.length === 1) {
        touchYRef.current = e.touches[0].clientY;
        // Long-press: dispara selecao da linha se o dedo nao mover ~550ms
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
            // selectLines usa indice do buffer INTEIRO (0 = inicio do scrollback):
            // converte a linha visivel somando o baseY.
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
      // Movimento >10px = gesto de swipe: cancela o long-press
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
        // arrastar p/ cima (dy<0) → ver histórico; p/ baixo → voltar ao fundo
        t.scrollLines(dy < 0 ? -lines : lines);
        e.preventDefault();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      touchYRef.current = null;
      touchStartPosRef.current = null;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      // Long-press disparado: o tap seguinte do xterm (touchend no document)
      // LIMPARIA a selecao — bloqueia a propagacao para preservar a linha
      // selecionada e o menu aberto.
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

  // FASE 1 — status de conexao explicito: LIVE (verde) / Reconectando ou
  // Conectando (ambar, com spinner) / Desconectado (vermelho).
  const statusColor = conn === "live" ? "#22c55e" : conn === "connecting" ? "#f59e0b" : "#ef4444";
  const statusLabel = conn === "live" ? "LIVE"
    : conn === "connecting"
      ? (everLiveRef.current ? "Reconectando…" : "Conectando…")
      : "Desconectado";

  // A barra é uma accessory view do teclado (como no Termius): existe enquanto
  // o teclado virtual está aberto (kbInset > 0), independente de estado de foco
  // — evita flicker ao tocar nos botões (o toque rouba o foco da textarea).
  // Teclado fechado → desce/some junto.
  const showKeysBar = kbInset > 0;

  // ── Scrollbar customizada real (buffer de 10000 linhas) ──
  // Conectada ao xterm: term.onScroll atualiza scrollInfo e o drag chama
  // term.scrollToLine() — navega o buffer DE VERDADE (não é decorativa).
  const rows = termRef.current?.rows ?? 0;
  const totalLines = scrollInfo.b + rows; // scrollback + viewport
  const thumbHeightPct = totalLines > 0
    ? Math.max(8, Math.min(100, (rows / totalLines) * 100))
    : 100;
  const thumbTopPct = scrollInfo.b > 0
    ? (scrollInfo.v / scrollInfo.b) * (100 - thumbHeightPct)
    : 0;
  const atBottom = scrollInfo.b === 0 || scrollInfo.v >= scrollInfo.b;
  const showScrollbar = scrollInfo.b > 0;

  // Salta/arrasta: mapeia a posição do toque no trilho para uma linha do
  // buffer (scrollToLine) e move o viewport do xterm.
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
  const keyBase = "flex h-11 min-w-[44px] shrink-0 select-none items-center justify-center rounded-xl border px-2 text-[10px] font-mono transition-colors active:scale-95";
  const keyIdle = "border-emerald-900/50 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/15";
  const keyActive = "border-emerald-300 bg-emerald-400 text-emerald-950 font-bold ring-2 ring-emerald-300/80 shadow-[0_0_14px_rgba(52,211,153,0.7)]";

  const adaptiveHeight = tuiActive && kbInset > 0 ? vvHeight : null;

  // Texto legível do modo leitura: sem ANSI, CR normalizado, linhas
  // consecutivas repetidas removidas (redraws de frames) e linhas com alta
  // proporção de caracteres de desenho/spinner (Braille, box drawing, blocos)
  // descartadas — sobram as MENSAGENS da conversa.
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
    <div
      className="relative flex h-full flex-col bg-[#0d1117] pb-36 font-mono text-emerald-400"
      style={adaptiveHeight !== null ? { height: `${adaptiveHeight}px` } : undefined}
    >
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
          <button onClick={() => { showLogRef.current = true; setShowLog(true); }} title="Ver contexto completo (modo leitura)"
            className="rounded-md border border-emerald-900/50 bg-emerald-500/5 p-1 text-emerald-300 hover:bg-emerald-500/10">
            <FileText className="h-3.5 w-3.5" />
          </button>
          {conn === "offline" && (
            <button onClick={connect} title="Reconectar"
              className="rounded-md border border-emerald-900/50 bg-emerald-500/5 p-1 text-emerald-300 hover:bg-emerald-500/10">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {note && (
        <div className="border-b border-red-900/40 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-300">{note}</div>
      )}

      <div className="border-b border-emerald-900/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {quickCmds.map((q) => (
            <button key={q} onClick={() => writeToShell(q + "\r")}
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

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="h-full w-full overflow-hidden px-1.5 py-1.5" />

        {/* Scrollbar customizada REAL: reflete a posição no buffer (10000
            linhas) e controla o viewport via scrollToLine no drag/touch.
            Só aparece quando há scrollback além da tela. */}
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

        {/* Indicador "modo histórico" — usuário rolou pra cima; tocar volta ao live */}
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

      {/* ── Barra de teclas especiais (mobile) — ancorada acima do teclado virtual ── */}
      {/* Barra de teclas = "input accessory view" (Termius): fixed na borda
          inferior da janela, com bottom = kbInset (topo do teclado virtual).
          NÃO participa do layout → o terminal não reflowa nem reposiciona. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 px-2"
        style={{ bottom: showKeysBar ? kbInset + 8 : -72, transition: "bottom 0.18s ease" }}
        data-testid="special-keys-bar"
      >
        <div className="pointer-events-auto thin-scroll mx-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-emerald-900/50 bg-[#0d1117]/95 px-2 py-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.55)] backdrop-blur-sm">
          <SwipeKey type="button" onPointerDown={pressCtrl} onClick={pressCtrl}
            onSwipeUp={swipeCtrlUp} onSwipeDown={swipeCtrlDown} data-testid="key-ctrl"
            className={cn(keyBase, "active:bg-emerald-400 active:text-emerald-950", armed === "ctrl" ? keyActive : keyIdle)}>Ctrl</SwipeKey>
          <SwipeKey type="button" onPointerDown={pressAlt} onClick={pressAlt}
            onSwipeUp={swipeAltUp} onSwipeDown={swipeAltDown} data-testid="key-alt"
            className={cn(keyBase, "active:bg-emerald-400 active:text-emerald-950", armed === "alt" ? keyActive : keyIdle)}>Alt</SwipeKey>
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

      {/* ── FASE 2 — menu de copiar por long-press (selecao de linha) ── */}
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

      {/* ── Modo leitura: contexto completo da conversa (OpenCode/Claude) ──
          As TUIs sobrescrevem a tela (sem scrollback); este overlay mostra o
          texto puro de TUDO que passou pelo pty, rolável (scroll nativo que
          funciona no touch) — o usuário lê todos os cenários da conversa. */}
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
}