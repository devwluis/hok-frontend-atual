"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// FIX 20/08 (quedas de conexão do terminal): a conexão WebSocket do PTY vive
// AQUI, num provider global montado acima do AppShell. Trocar de aba
// (Chat/N8N/Config) desmonta a tela do Terminal, mas o socket permanece vivo
// em background — o shell real do servidor continua rodando, e ao voltar a
// tela reconecta à MESMA sessão sem perder estado. Antes, o WebSocket vivia
// dentro do TerminalScreen e o unmount fechava a conexão a cada troca de aba.

const SETTINGS_KEY = "hokma.settings.v1";
const SESSION_KEY = "hokma.terminal.session.v1";

export type Conn = "idle" | "connecting" | "live" | "offline";

type TerminalContextValue = {
  conn: Conn;
  note: string;
  connect: () => void;
  ensureConnected: () => void;
  teardown: () => void;
  write: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
  subscribeOutput: (fn: (text: string) => void) => () => void;
  subscribeLive: (fn: () => void) => () => void;
  getRecentOutput: () => string;
};

const TerminalContext = createContext<TerminalContextValue | null>(null);

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

function readSavedSessionId(): string {
  try { return localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
}

// Buffer contínuo do output do PTY (cap ~200 chunks): permite reescrever na
// tela o que aconteceu no shell enquanto a aba do Terminal estava desmontada.
const RECENT_MAX_CHUNKS = 200;
const RECENT_MAX_CHARS = 100_000;

export function TerminalProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(400);
  const listenersRef = useRef<Set<(text: string) => void>>(new Set());
  const liveListenersRef = useRef<Set<() => void>>(new Set());
  const recentRef = useRef<string[]>([]);
  const attachedRef = useRef(false); // true depois do "ready" da sessão atual
  const [conn, setConn] = useState<Conn>("idle");
  const [note, setNote] = useState("");

  // Scrollback enviado pelo servidor no reattach (base64 → UTF-8). É
  // autoritativo — limpa o buffer de replay local e reescreve na tela.
  const handleScrollback = useCallback((data: unknown) => {
    if (typeof data !== "string") return;
    try {
      const bin = atob(data);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const raw = new TextDecoder("utf-8").decode(bytes);
      recentRef.current = [];
      listenersRef.current.forEach((fn) => {
        try { fn(raw); } catch { /* noop */ }
      });
    } catch { /* ignore */ }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      connectRef.current();
    }, retryDelayRef.current);
    retryDelayRef.current = Math.min(retryDelayRef.current * 2, 15_000);
  }, []);

  const connectRef = useRef<() => void>(() => {});
  connectRef.current = () => {
    const { serverUrl, token } = readSettings();
    teardownRef.current();
    recentRef.current = [];
    attachedRef.current = false;
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
    const saved = readSavedSessionId();
    const url = `${base}/terminal/ws?token=${encodeURIComponent(token)}${saved ? `&session_id=${encodeURIComponent(saved)}` : ""}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setConn("offline");
      setNote("WebSocket indisponível neste ambiente.");
      return;
    }
    wsRef.current = ws;
    intentionalCloseRef.current = false;

    ws.onopen = () => {
      // Guard de identidade: eventos de um socket antigo NÃO podem afetar
      // o estado quando outro socket já assumiu (bug de corrida corrigido).
      if (wsRef.current !== ws) return;
      setConn("connecting");
    };

    ws.onmessage = (ev) => {
      if (wsRef.current !== ws) return;
      if (typeof ev.data !== "string") return;
      const text = ev.data as string;

      // Fase de attach: o backend envia mensagens de controle (session_id,
      // scrollback, ready) ANTES do stream ao vivo. Após "ready", tudo é
      // texto cru do terminal.
      if (!attachedRef.current) {
        let ctrl: Record<string, unknown> | null = null;
        try { ctrl = JSON.parse(text) as Record<string, unknown>; } catch { ctrl = null; }
        if (ctrl && typeof ctrl === "object" && typeof ctrl.type === "string") {
          if (ctrl.type === "session") {
            const sid = typeof ctrl.session_id === "string" ? ctrl.session_id : "";
            const created = ctrl.created === true;
            const prevSid = readSavedSessionId();
            // Diagnóstico de queda: distingue reattach (created=false, MESMA
            // sessão, processo preservado) de sessão nova (created=true).
            console.log(`[term] sessão sid=${sid} created=${created} prevSid=${prevSid} reattach=${!created}`);
            if (sid) {
              try { localStorage.setItem(SESSION_KEY, sid); } catch { /* noop */ }
            }
            setConn("live");
            setNote("");
            if (created) {
              // sessão nova: banner + aviso sutil se havia uma anterior expirada
              if (prevSid && prevSid !== sid) {
                setNote("Sessão anterior expirada — nova sessão iniciada.");
              }
              liveListenersRef.current.forEach((fn) => { try { fn(); } catch { /* noop */ } });
            }
            return;
          }
          if (ctrl.type === "scrollback") {
            handleScrollback(ctrl.data);
            return;
          }
          if (ctrl.type === "ready") {
            attachedRef.current = true;
            setConn("live");
            setNote("");
            return;
          }
          if (ctrl.type === "session_error") {
            setConn("offline");
            setNote("Falha ao iniciar a sessão do terminal.");
            return;
          }
        }
      }

      // stream ao vivo (texto cru do pty)
      recentRef.current.push(text);
      if (recentRef.current.length > RECENT_MAX_CHUNKS) recentRef.current.shift();
      let total = 0;
      for (const c of recentRef.current) total += c.length;
      while (total > RECENT_MAX_CHARS && recentRef.current.length > 1) {
        recentRef.current.shift();
        total = 0;
        for (const c of recentRef.current) total += c.length;
      }
      listenersRef.current.forEach((fn) => {
        try { fn(text); } catch { /* noop */ }
      });
    };

    ws.onclose = (ev) => {
      if (wsRef.current === ws) wsRef.current = null;
      // Guard de identidade + ignora fechamento intencional (teardown).
      if (wsRef.current !== ws && wsRef.current !== null) return;
      // Diagnóstico de queda: registra close code/reason + session_id salvo
      // (para saber se a próxima conexão faz reattach ou sessão nova).
      console.log(`[term] ws close code=${ev?.code ?? "?"} reason=${JSON.stringify(ev?.reason ?? "")} wasClean=${ev?.wasClean ?? "?"} session_id=${readSavedSessionId()}`);
      if (intentionalCloseRef.current) return;
      attachedRef.current = false;
      setConn("offline");
      if (!document.hidden) scheduleReconnect();
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setConn("offline");
      setNote("Falha na conexão com o servidor.");
    };
  };

  const teardownRef = useRef<() => void>(() => {});
  teardownRef.current = () => {
    intentionalCloseRef.current = true;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    try { wsRef.current?.close(); } catch { /* noop */ }
    wsRef.current = null;
  };

  const connect = useCallback(() => connectRef.current(), []);

  // FIX 20/08 (regressão de sessão): ao voltar da aba Terminal, a tela NÃO
  // pode chamar connect() (que faz teardown e derruba o socket vivo — o
  // backend então mata o bash e a sessão reseta). ensureConnected só abre
  // conexão se não houver socket OPEN/CONNECTING; com socket vivo, mantém a
  // MESMA sessão (shell real continua rodando).
  const ensureConnected = useCallback(() => {
    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    connectRef.current();
  }, []);

  const teardown = useCallback(() => teardownRef.current(), []);

  const write = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data }));
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && cols > 0 && rows > 0) {
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  }, []);

  const subscribeOutput = useCallback((fn: (text: string) => void) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  const subscribeLive = useCallback((fn: () => void) => {
    liveListenersRef.current.add(fn);
    return () => { liveListenersRef.current.delete(fn); };
  }, []);

  const getRecentOutput = useCallback(() => recentRef.current.join(""), []);

  // Reconecta imediatamente ao voltar a aba/janela para primeiro plano
  // (suspensão do Android/Chrome mata o socket em background).
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        const ws = wsRef.current;
        if (ws?.readyState !== WebSocket.OPEN && !intentionalCloseRef.current) {
          connectRef.current();
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Mudança de settings (Server URL / HOK_TOKEN) em outra aba/janela →
  // reconecta com os valores novos. Vive aqui (provider) para funcionar
  // mesmo com a tela do Terminal desmontada.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) connectRef.current();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const value: TerminalContextValue = {
    conn, note, connect, ensureConnected, teardown, write, sendResize, subscribeOutput, subscribeLive, getRecentOutput,
  };

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error("useTerminal deve ser usado dentro de <TerminalProvider>");
  return ctx;
}