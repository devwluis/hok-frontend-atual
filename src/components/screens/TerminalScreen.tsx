"use client";
import { useEffect, useRef, useState } from "react";
import { Terminal as TermIcon, Circle, Wifi, WifiOff, RotateCcw, CornerDownLeft, CornerUpLeft, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = "hokma.settings.v1";
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

function readSettings(): { serverUrl: string; token: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { serverUrl: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return { serverUrl: s["Server URL"] || "", token: s["HOK_TOKEN"] || "" };
  } catch {
    return { serverUrl: "", token: "" };
  }
}

const QUICK = [
  "pwd", "ls -la", "whoami", "uptime",
  "df -h /sdcard", "free -h", "uname -r",
];

type Conn = "idle" | "connecting" | "live" | "offline";
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
  const wsRef = useRef<WebSocket | null>(null);
  const armedRef = useRef<ArmedMod>("none");
  const [conn, setConn] = useState<Conn>("idle");
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState<ArmedMod>("none");
  const [focused, setFocused] = useState(false);
  const [kbInset, setKbInset] = useState(0);

  const teardown = () => {
    try { wsRef.current?.close(); } catch { /* noop */ }
    wsRef.current = null;
  };

  const connect = () => {
    const { serverUrl, token } = readSettings();
    teardown();
    if (!serverUrl) {
      setConn("offline");
      setNote("Configure Server URL + HOK_TOKEN nas Configurações.");
      return;
    }
    if (!token) {
      setConn("offline");
      setNote("HOK_TOKEN ausente — o terminal exige autenticação.");
      return;
    }

    setConn("connecting");
    setNote("");
    const base = serverUrl.replace(/\/$/, "").replace(/^http/, "ws");
    const url = `${base}/terminal/ws?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setConn("offline");
      setNote("WebSocket indisponível neste ambiente.");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setConn("live");
      const dims = fitRef.current?.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
      }
      const term = termRef.current;
      if (term) {
        term.writeln("\r\n\x1b[32m● sessão PTY real iniciada\x1b[0m (Ctrl+D sai)");
        term.scrollToBottom();
      }
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        termRef.current?.write(ev.data);
        termRef.current?.scrollToBottom();
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      setConn("offline");
    };
    ws.onerror = () => {
      setConn("offline");
      setNote("Falha na conexão com o servidor.");
    };
  };

  const writeToShell = (data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data }));
    }
  };

  // ── Modificadores sticky (Ctrl/Alt) para teclado touch ──
  // Sempre refoca a textarea do xterm após tocar a barra: o toque num botão
  // roubaria o foco e fecharia o teclado virtual — refocar mantém o teclado
  // aberto e captura a próxima tecla do teclado do sistema.
  const refocusTerminal = () => {
    try { termRef.current?.textarea?.focus(); } catch { /* ignore */ }
    setFocused(true); // o toque no botão dispara blur na textarea; garante a barra visível
  };
  const setMod = (mod: ArmedMod) => {
    armedRef.current = mod;
    setArmed(mod);
    refocusTerminal();
  };
  const pressCtrl = () => setMod(armedRef.current === "ctrl" ? "none" : "ctrl");
  const pressAlt = () => setMod(armedRef.current === "alt" ? "none" : "alt");
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
      scrollback: 5000,
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

    term.onData((data) => {
      const mod = armedRef.current;
      if (mod !== "none") {
        // Desarma sempre após a próxima tecla (comportamento "sticky one-shot")
        armedRef.current = "none";
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

    // Detecta foco do input do terminal (textarea oculto do xterm) para
    // mostrar a barra de teclas especiais acima do teclado virtual.
    const ta = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    if (ta) {
      ta.addEventListener("focus", () => setFocused(true));
      ta.addEventListener("blur", () => setFocused(false));
    }

    // Restaura a última sessão (histórico visível) antes de conectar —
    // o usuário vê o terminal exatamente como deixou.
    const saved = readTerminalState();
    if (saved && saved.history.length > 0) {
      term.write(saved.history.join("\r\n") + "\r\n");
    }

    // Snapshot incremental a cada 2s (não depende de unload da página,
    // que pode não disparar ao fechar a aba em mobile).
    const saveTimer = setInterval(() => {
      const t = termRef.current;
      if (!t) return;
      writeTerminalState("pty-1", snapshotTerminalLines(t));
    }, 2000);

    const onResize = () => {
      try {
        fit.fit();
        termRef.current?.scrollToBottom();
        const dims = fit.proposeDimensions();
        if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        }
      } catch { /* noop */ }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    connect();
    return () => {
      clearInterval(saveTimer);
      const t = termRef.current;
      if (t) writeTerminalState("pty-1", snapshotTerminalLines(t)); // save final no unmount
      ro.disconnect();
      teardown();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => { if (e.key === SETTINGS_KEY) connect(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Altura do teclado virtual (Android): quando abre, o visualViewport encolhe.
  // Usa isso para ancorar a barra de teclas logo acima do teclado.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVV = () => {
      const inset = Math.max(0, window.innerHeight - vv.height);
      setKbInset(inset);
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

  const showKeysBar = focused || armed !== "none";
  const keyBase = "flex h-11 min-w-[44px] shrink-0 select-none items-center justify-center rounded-xl border px-2 text-[10px] font-mono transition-colors active:scale-95";
  const keyIdle = "border-emerald-900/50 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/15";
  const keyActive = "border-emerald-300/70 bg-emerald-500/30 text-white ring-1 ring-emerald-400/60";

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

      <div ref={hostRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5" />

      {/* ── Barra de teclas especiais (mobile) — ancorada acima do teclado virtual ── */}
      <div
        className="pointer-events-none absolute inset-x-0 z-40 px-2"
        style={{ bottom: showKeysBar ? kbInset + (kbInset > 0 ? 8 : 116) : -64, transition: "bottom 0.18s ease" }}
        data-testid="special-keys-bar"
      >
        <div className="pointer-events-auto thin-scroll mx-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-emerald-900/50 bg-[#0d1117]/95 px-2 py-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.55)] backdrop-blur-sm">
          <button type="button" onClick={pressCtrl} data-testid="key-ctrl"
            className={cn(keyBase, armed === "ctrl" ? keyActive : keyIdle)}>Ctrl</button>
          <button type="button" onClick={pressAlt} data-testid="key-alt"
            className={cn(keyBase, armed === "alt" ? keyActive : keyIdle)}>Alt</button>
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