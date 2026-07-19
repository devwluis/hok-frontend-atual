"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Circle, Wifi, WifiOff } from "lucide-react";

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

async function runShell(
  serverUrl: string,
  token: string,
  cmd: string,
  signal?: AbortSignal,
): Promise<{ output: string; ok: boolean }> {
  const url = serverUrl.replace(/\/$/, "") + "/shell";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers["X-Hok-Token"] = token;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ cmd }),
    signal,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { output?: string; sucesso?: boolean };
  return { output: data.output ?? "", ok: data.sucesso !== false };
}

const QUICK = [
  "pwd", "ls -la", "whoami", "uptime",
  "df -h /sdcard", "free -h", "uname -r",
  "termux-battery-status 2>/dev/null | head -5",
];

const INITIAL = [
  "Hokmá Terminal — HOK Server",
  "Configure Server URL + HOK_TOKEN nas Configurações.",
  "───────────────────────────────────────",
];

export function TerminalScreen() {
  const [lines, setLines] = useState<string[]>(INITIAL);
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    const check = async () => {
      const { serverUrl, token } = readSettings();
      if (!serverUrl) { setConnected(false); return; }
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 4000);
        const r = await runShell(serverUrl, token, "echo ok", ctrl.signal);
        setConnected(r.ok && r.output.trim() === "ok");
      } catch {
        setConnected(false);
      }
    };
    check();
    const handler = (e: StorageEvent) => { if (e.key === SETTINGS_KEY) check(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const addLine = (l: string) => setLines((prev) => [...prev, l]);

  const run = useCallback(async (c?: string) => {
    const v = (c ?? cmd).trim();
    if (!v || running) return;
    setCmd("");
    setHistory((h) => [v, ...h.filter((x) => x !== v)].slice(0, 50));
    setHistIdx(-1);
    addLine(`$ ${v}`);

    if (v === "clear" || v === "cls") { setLines([]); return; }

    const { serverUrl, token } = readSettings();
    if (!serverUrl) { addLine("  [erro] Server URL não configurado"); return; }

    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const { output } = await runShell(serverUrl, token, v, ctrl.signal);
      const trimmed = output.trim();
      if (trimmed) {
        trimmed.split("\n").forEach((l) => setLines((prev) => [...prev, l]));
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        addLine("  ^C");
      } else {
        addLine(`  [erro] ${err instanceof Error ? err.message : "Erro desconhecido"}`);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [cmd, running]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { run(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const i = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(i); setCmd(history[i] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const i = Math.max(histIdx - 1, -1);
      setHistIdx(i); setCmd(i === -1 ? "" : (history[i] ?? ""));
    }
    if (e.key === "c" && e.ctrlKey) { e.preventDefault(); abortRef.current?.abort(); addLine("^C"); }
    if (e.key === "l" && e.ctrlKey) { e.preventDefault(); setLines([]); }
  };

  const statusColor = connected === true ? "#22c55e" : connected === false ? "#ef4444" : "#f59e0b";
  const statusLabel = connected === true ? "LIVE" : connected === false ? "OFFLINE" : "...";

  return (
    <div className="flex h-full flex-col bg-[#0d1117] font-mono text-emerald-400">
      <div className="flex items-center justify-between border-b border-emerald-900/40 px-3 py-2 text-[11px]">
        <span className="text-emerald-300/80">HOK Server · shell</span>
        <div className="flex items-center gap-2">
          {connected === true
            ? <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            : <WifiOff className="h-3.5 w-3.5 text-red-400" />}
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{ background: `${statusColor}20`, color: statusColor }}>
            <Circle className="h-2 w-2" style={{ fill: statusColor }} />
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-emerald-900/40 px-3 py-2">
        {QUICK.map((q) => (
          <button key={q} onClick={() => run(q)} disabled={running}
            className="rounded-md border border-emerald-900/50 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40">
            {q.length > 18 ? q.slice(0, 16) + "…" : q}
          </button>
        ))}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-3 py-2 text-[12.5px] leading-relaxed"
        onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap" style={{
            color: l.startsWith("$") ? "#34d399" : l.startsWith("  [erro]") ? "#f87171" : "#6ee7b7",
          }}>{l}</div>
        ))}
        {running && <div className="text-emerald-600 animate-pulse">▋ executando…</div>}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-emerald-900/40 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+96px)]">
        <span className="text-emerald-500">{">"}</span>
        <input ref={inputRef} value={cmd} onChange={(e) => setCmd(e.target.value)}
          onKeyDown={onKeyDown} disabled={running} autoComplete="off" spellCheck={false}
          placeholder={running ? "aguardando… (Ctrl+C cancelar)" : "comando…"}
          className="flex-1 bg-transparent text-sm text-emerald-300 outline-none placeholder:text-emerald-800 disabled:opacity-50"
          autoFocus />
        <button onClick={() => run()} disabled={running || !cmd.trim()}
          className="rounded-md bg-emerald-500/15 p-1.5 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
