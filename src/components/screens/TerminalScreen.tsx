"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as TermIcon, Circle, Wifi, WifiOff, RotateCcw, CornerDownLeft, CornerUpLeft, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { useTerminal } from "@/hooks/use-terminal";

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

const QUICK = [
  "pwd", "ls -la", "whoami", "uptime",
  "df -h /sdcard", "free -h", "uname -r",
];

type ArmedMod = "none" | "ctrl" | "alt";

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
    }, 150);
  }, [sendResize]);

  const writeToShell = (data: string) => write(data);

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

  useEffect(() => {
    const host = hostRef.current;
    if (!host || termRef.current) return;

    const term = new Terminal({
      fontSize: 12.5,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      cursorBlink: true,
      scrollback: 10000,
      theme: {
        background: "#0d1117",
        foreground: "#6ee7b7",
        cursor: "#34d399",
        cursorAccent: "#0d1117",
        selectionBackground: "#34d39933",
        black: "#0d1117", red: "#f87171", green: "#34d399", yellow: "#f5b942",
        blue: "#60a5fa", magenta: "#a78bfa", cyan: "#22d3ee", white: "#e5e7eb",
        brightBlack: "#4b5563", brightRed: "#f87171", brightGreen: "#6ee7b7",
        brightYellow: "#fde68a", brightBlue: "#93c5fd", brightMagenta: "#c4b5fd",
        brightCyan: "#67e8f9", brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

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
      t.write(text);
      t.scrollToBottom();
    };
    const unsub = subscribeOutput(onOutput);

    // Quando a conexão abre de verdade (socket novo), avisa na tela e
    // reenvia o resize (o tamanho do terminal pode ter mudado).
    const onLive = () => {
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
      setKbInset(Math.max(0, window.innerHeight - vv.height));
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    return () => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
    };
  }, []);

  const statusColor = conn === "live" ? "#22c55e" : conn === "connecting" ? "#f59e0b" : "#ef4444";
  const statusLabel = conn === "live" ? "LIVE" : conn === "connecting" ? "CONECTANDO…" : "OFFLINE";

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

  return (
    <div className="relative flex h-full flex-col bg-[#0d1117] pb-36 font-mono text-emerald-400">
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
            <Circle className="h-2 w-2" style={{ fill: statusColor }} />
            {statusLabel}
          </span>
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

      <div className="flex flex-wrap gap-1 border-b border-emerald-900/40 px-3 py-2">
        {QUICK.map((q) => (
          <button key={q} onClick={() => writeToShell(q + "\r")}
            className="rounded-md border border-emerald-900/50 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10">
            {q.length > 18 ? q.slice(0, 16) + "…" : q}
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="h-full w-full overflow-hidden px-1.5 py-1.5" />

        {/* Scrollbar customizada REAL: reflete a posição no buffer (10000
            linhas) e controla o viewport via scrollToLine no drag/touch.
            Só aparece quando há scrollback além da tela. */}
        {showScrollbar && (
          <div
            ref={trackRef}
            className="absolute right-0.5 top-1.5 bottom-1.5 z-10 w-2 cursor-pointer touch-none select-none"
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            data-testid="term-scrollbar-track"
          >
            <div
              className="absolute left-0 w-full rounded-full bg-emerald-400/40 hover:bg-emerald-400/70"
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
          <button type="button" onPointerDown={pressCtrl} onClick={pressCtrl} data-testid="key-ctrl"
            className={cn(keyBase, "touch-manipulation active:bg-emerald-400 active:text-emerald-950", armed === "ctrl" ? keyActive : keyIdle)}>Ctrl</button>
          <button type="button" onPointerDown={pressAlt} onClick={pressAlt} data-testid="key-alt"
            className={cn(keyBase, "touch-manipulation active:bg-emerald-400 active:text-emerald-950", armed === "alt" ? keyActive : keyIdle)}>Alt</button>
          <button type="button" onClick={pressEsc} data-testid="key-esc"
            className={cn(keyBase, keyIdle)}>Esc</button>
          <button type="button" onClick={pressTab} data-testid="key-tab"
            className={cn(keyBase, keyIdle)}>Tab</button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          <button type="button" onClick={pressCtrlC} data-testid="key-ctrlc"
            className={cn(keyBase, keyIdle, "text-red-300")}>Ctrl<span className="ml-0.5 text-[9px]">C</span></button>
          <button type="button" onClick={pressCtrlD} data-testid="key-ctrld"
            className={cn(keyBase, keyIdle, "text-red-300")}>Ctrl<span className="ml-0.5 text-[9px]">D</span></button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          <button type="button" onClick={() => pressArrow("up")} data-testid="key-up"
            className={cn(keyBase, keyIdle)} aria-label="Seta para cima"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => pressArrow("down")} data-testid="key-down"
            className={cn(keyBase, keyIdle)} aria-label="Seta para baixo"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" onClick={() => pressArrow("left")} data-testid="key-left"
            className={cn(keyBase, keyIdle)} aria-label="Seta para a esquerda"><ArrowLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => pressArrow("right")} data-testid="key-right"
            className={cn(keyBase, keyIdle)} aria-label="Seta para a direita"><ArrowRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}