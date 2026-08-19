"use client";
import { useEffect, useRef, useState } from "react";
import { Terminal as TermIcon, Circle, Wifi, WifiOff, RotateCcw } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const SETTINGS_KEY = "hokma.settings.v1";

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

export function TerminalScreen() {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [conn, setConn] = useState<Conn>("idle");
  const [note, setNote] = useState("");

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

    term.onData((data) => writeToShell(data));

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

  const statusColor = conn === "live" ? "#22c55e" : conn === "connecting" ? "#f59e0b" : "#ef4444";
  const statusLabel = conn === "live" ? "LIVE" : conn === "connecting" ? "CONECTANDO…" : "OFFLINE";

  return (
    <div className="flex h-full flex-col bg-[#0d1117] pb-36 font-mono text-emerald-400">
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
    </div>
  );
}