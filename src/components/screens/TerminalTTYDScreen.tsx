"use client";
import { useEffect, useState } from "react";

// Terminal REAL via ttyd (22/08 — substitui o xterm in-app instável).
// Fluxo: pede um token EFÊMERO (5 min) ao backend (POST /terminal/token,
// owner-only) e renderiza o iframe do hostname dedicado
// (terminal.imoveischaves.com → Cloudflare Tunnel → proxy validador no
// backend → ttyd local 127.0.0.1:7681). O token vai na query da entrada;
// o proxy o transforma em cookie de sessão para os upgrades WebSocket.
export function TerminalTTYDScreen() {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const raw = localStorage.getItem("hokma.settings.v1");
        const s = raw ? (JSON.parse(raw) as Record<string, string>) : {};
        const server = String(s["Server URL"] ?? "").replace(/\/$/, "");
        const tok = String(s["HOK_TOKEN"] ?? "");
        const res = await fetch(`${server}/terminal/token`, {
          method: "POST",
          headers: { "X-Hok-Token": tok },
        });
        if (!res.ok) {
          throw new Error(`token indisponível (${res.status})`);
        }
        const j = (await res.json()) as { terminal_url?: string };
        if (!j.terminal_url) {
          throw new Error("resposta sem terminal_url");
        }
        if (alive) {
          setUrl(j.terminal_url);
        }
      } catch (e) {
        if (alive) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-[#0d1117] font-mono text-emerald-400">
      <div className="flex items-center justify-between border-b border-emerald-900/40 px-3 py-2 text-[11px]">
        <span className="text-emerald-300/80">HOK Server · terminal (ttyd)</span>
        <span className={err ? "text-red-300" : url ? "text-emerald-300" : "text-amber-300"}>
          {err ? "ERRO" : url ? "LIVE" : "Conectando…"}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        {err ? (
          <div className="p-3 text-[11px] text-red-300">⚠️ {err} — verifique Server URL/HOK_TOKEN nas Configurações.</div>
        ) : url ? (
          <iframe
            key={url}
            src={url}
            title="Terminal HOK"
            className="h-full w-full border-0 bg-black"
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="p-3 text-[11px] text-emerald-300/70">Carregando terminal…</div>
        )}
      </div>
    </div>
  );
}
