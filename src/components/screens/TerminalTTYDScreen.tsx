"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const RENEW_MARGIN_S = 60; // renova o token 60s antes de expirar
const RETRY_ERR_MS = 10_000; // falha de rede/servidor: tenta de novo em 10s

// Terminal REAL via ttyd (substitui o xterm in-app instável).
// Fluxo: pede um token EFÊMERO (5 min) ao backend (POST /terminal/token,
// owner-only via header X-Hok-Token — mesmo padrão das demais chamadas,
// credenciais vindas de hokma.settings.v1 no localStorage) e renderiza o
// iframe do hostname dedicado (terminal.imoveischaves.com → Cloudflare
// Tunnel → proxy validador no backend → ttyd local 127.0.0.1:7681).
//
// Renovação automática (FIX tokrefresh): enquanto o usuário estiver na aba,
// um novo token é buscado ANTES da expiração (margem fixa), recarregando o
// iframe (key={url}) para nunca servir token morto. Nota: o reload inicia
// uma nova sessão ttyd — a sessão shell corrente não sobrevive ao refresh.
export function TerminalTTYDScreen() {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const fetchToken = useCallback(async (): Promise<number> => {
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
    const j = (await res.json()) as { terminal_url?: string; expires_in?: number };
    if (!j.terminal_url) {
      throw new Error("resposta sem terminal_url");
    }
    setUrl(j.terminal_url); // key={url} força reload do iframe
    setErr(null);
    return typeof j.expires_in === "number" ? j.expires_in : 300;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = async () => {
      try {
        const exp = await fetchToken();
        if (!aliveRef.current) return;
        timer = setTimeout(cycle, Math.max(30, exp - RENEW_MARGIN_S) * 1000);
      } catch (e) {
        if (!aliveRef.current) return;
        setErr(e instanceof Error ? e.message : String(e));
        timer = setTimeout(cycle, RETRY_ERR_MS);
      }
    };
    void cycle();
    return () => {
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [fetchToken]);

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
          <div className="p-3 text-[11px] text-red-300">
            ⚠️ {err} — verifique Server URL/HOK_TOKEN nas Configurações. Nova tentativa em 10s.
          </div>
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
