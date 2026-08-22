"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// FASE 6 (múltiplas sessões simultâneas): o provider gerencia N sessões pty
// independentes (abas "Sessão 1/2/..."), cada uma com seu WebSocket, seu
// session_id de reattach e seu buffer de replay. O TerminalScreen mostra uma
// aba por vez, mas todas as sessões continuam vivas em background (o backend
// mantém o bash de cada uma).
//
// Herança da FIX 20/08: a conexão WebSocket vive AQUI (provider global acima
// do AppShell) — trocar de aba do app (Chat/N8N/Config) não mata as sessões.

const SETTINGS_KEY = "hokma.settings.v1";
const TABS_KEY = "hokma.terminal.tabs.v1";
// Migração: session_id da versão antiga (1 sessão única)
const LEGACY_SESSION_KEY = "hokma.terminal.session.v1";

export type Conn = "idle" | "connecting" | "live" | "offline";

export type TerminalTab = {
  id: string;
  serverSessionId: string;
  conn: Conn;
  note: string;
};

type TabSession = {
  id: string;
  serverSessionId: string;
  wantNew: boolean; // próxima conexão cria sessão NOVA no backend (?new=1)
  ws: WebSocket | null;
  conn: Conn;
  note: string;
  attached: boolean;
  intentionalClose: boolean;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryDelay: number;
  recent: string[];
  outputListeners: Set<(text: string) => void>;
  resetListeners: Set<() => void>;
  liveListeners: Set<() => void>;
};

type TerminalContextValue = {
  tabs: TerminalTab[];
  activeTabId: string;
  setActiveTab: (id: string) => void;
  addTab: () => void;
  removeTab: (id: string) => void;
  connect: (tabId: string) => void;
  ensureConnected: (tabId: string) => void;
  teardown: (tabId: string) => void;
  write: (tabId: string, data: string) => void;
  sendResize: (tabId: string, cols: number, rows: number) => void;
  subscribeOutput: (tabId: string, fn: (text: string) => void) => () => void;
  subscribeReset: (tabId: string, fn: () => void) => () => void;
  subscribeLive: (tabId: string, fn: () => void) => () => void;
  takeRecentOutput: (tabId: string) => string;
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

function newTabId(): string {
  return "tab-" + Math.random().toString(36).slice(2, 10);
}

// Abas persistidas: [{id, sid}] + activeId. Migração da v1: se não há nada,
// cria 1 aba com o session_id antigo (reattach à sessão única existente).
function readTabs(): { tabs: { id: string; sid: string }[]; activeId: string } {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { tabs?: { id: string; sid: string }[]; activeId?: string };
      if (Array.isArray(p.tabs) && p.tabs.length > 0) {
        const tabs = p.tabs.filter((t) => t && typeof t.id === "string");
        if (tabs.length > 0) {
          return { tabs, activeId: p.activeId && tabs.some((t) => t.id === p.activeId) ? p.activeId : tabs[0].id };
        }
      }
    }
  } catch { /* ignore */ }
  try {
    const legacy = localStorage.getItem(LEGACY_SESSION_KEY) || "";
    return { tabs: [{ id: newTabId(), sid: legacy }], activeId: "" };
  } catch {
    return { tabs: [{ id: newTabId(), sid: "" }], activeId: "" };
  }
}

function writeTabs(tabs: { id: string; sid: string }[], activeId: string) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify({ tabs, activeId })); } catch { /* noop */ }
}

// Buffer contínuo do output do PTY (cap ~200 chunks): permite reescrever na
// tela o que aconteceu no shell enquanto a aba do Terminal estava desmontada.
const RECENT_MAX_CHUNKS = 200;
const RECENT_MAX_CHARS = 100_000;

export function TerminalProvider({ children }: { children: ReactNode }) {
  const sessionsRef = useRef<Map<string, TabSession>>(new Map());
  // readTabs() é chamado UMA vez (useRef): a migração v1 gera um id novo por
  // chamada — chamar duas vezes criava ids divergentes (activeTabId fantasma).
  const initialTabsRef = useRef(readTabs());
  const [tabs, setTabs] = useState<TerminalTab[]>(() =>
    initialTabsRef.current.tabs.map((t) => ({ id: t.id, serverSessionId: t.sid, conn: "idle" as Conn, note: "" })),
  );
  const [activeTabId, setActiveTabId] = useState<string>(() =>
    initialTabsRef.current.activeId || initialTabsRef.current.tabs[0]?.id || "",
  );

  const getSession = (tabId: string): TabSession => {
    let s = sessionsRef.current.get(tabId);
    if (!s) {
      const saved = tabs.find((t) => t.id === tabId);
      s = {
        id: tabId,
        serverSessionId: saved?.serverSessionId ?? "",
        wantNew: false,
        ws: null,
        conn: "idle",
        note: "",
        attached: false,
        intentionalClose: false,
        retryTimer: null,
        retryDelay: 400,
        recent: [],
        outputListeners: new Set(),
        resetListeners: new Set(),
        liveListeners: new Set(),
      };
      sessionsRef.current.set(tabId, s);
    }
    return s;
  };

  const setTabState = (tabId: string, patch: Partial<Pick<TabSession, "conn" | "note" | "serverSessionId">>) => {
    const s = sessionsRef.current.get(tabId);
    if (!s) return;
    if (patch.conn !== undefined) s.conn = patch.conn;
    if (patch.note !== undefined) s.note = patch.note;
    if (patch.serverSessionId !== undefined) s.serverSessionId = patch.serverSessionId;
    setTabs((prev) => prev.map((t) => (t.id === tabId
      ? { ...t, conn: s.conn, note: s.note, serverSessionId: s.serverSessionId }
      : t)));
  };

  // Scrollback enviado pelo servidor no reattach (base64 → UTF-8). É
  // autoritativo — limpa o buffer de replay local e REESCREVE a tela do zero.
  const handleScrollback = useCallback((tabId: string, data: unknown) => {
    if (typeof data !== "string") return;
    const s = sessionsRef.current.get(tabId);
    if (!s) return;
    try {
      const bin = atob(data);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const raw = new TextDecoder("utf-8").decode(bytes);
      s.recent = [];
      // FIX 22/08 (bug duplicação): o scrollback contém TUDO desde o início da
      // sessão. Reaplicá-lo com append sobre o xterm existente empilhava uma
      // cópia completa do histórico a cada reconexão (3 blocos idênticos no
      // vídeo). O replay só é autoritativo se a tela for LIMPA antes.
      s.resetListeners.forEach((fn) => { try { fn(); } catch { /* noop */ } });
      s.outputListeners.forEach((fn) => { try { fn(raw); } catch { /* noop */ } });
    } catch { /* ignore */ }
  }, []);

  const scheduleReconnect = useCallback((tabId: string) => {
    const s = sessionsRef.current.get(tabId);
    if (!s) return;
    if (s.retryTimer) return;
    s.retryTimer = setTimeout(() => {
      const s2 = sessionsRef.current.get(tabId);
      if (!s2) return;
      s2.retryTimer = null;
      connectInternal(tabId);
    }, s.retryDelay);
    s.retryDelay = Math.min(s.retryDelay * 2, 15_000);
  }, []);

  const teardownInternal = (tabId: string) => {
    const s = sessionsRef.current.get(tabId);
    if (!s) return;
    s.intentionalClose = true;
    if (s.retryTimer) { clearTimeout(s.retryTimer); s.retryTimer = null; }
    try { s.ws?.close(); } catch { /* noop */ }
    s.ws = null;
  };

  const connectInternal = (tabId: string) => {
    const s = sessionsRef.current.get(tabId);
    if (!s) return;
    const { serverUrl, token } = readSettings();
    teardownInternal(tabId);
    s.recent = [];
    s.attached = false;
    s.intentionalClose = false;
    if (!serverUrl) {
      setTabState(tabId, { conn: "offline", note: "Configure Server URL + HOK_TOKEN nas Configurações." });
      return;
    }
    if (!token) {
      setTabState(tabId, { conn: "offline", note: "HOK_TOKEN ausente — o terminal exige autenticação." });
      return;
    }

    setTabState(tabId, { conn: "connecting", note: "" });
    const base = serverUrl.replace(/\/$/, "").replace(/^http/, "ws");
    const sid = s.serverSessionId;
    const wantNew = s.wantNew;
    s.wantNew = false;
    const url = `${base}/terminal/ws?token=${encodeURIComponent(token)}${sid ? `&session_id=${encodeURIComponent(sid)}` : ""}${wantNew ? "&new=1" : ""}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setTabState(tabId, { conn: "offline", note: "WebSocket indisponível neste ambiente." });
      return;
    }
    s.ws = ws;
    // FIX 21/08: o stream do PTY chega em frames BINÁRIOS (o servidor usa
    // BinaryMessage, pois output de terminal pode ter bytes não-UTF-8).
    // binaryType=arraybuffer garante ev.data como ArrayBuffer, não Blob.
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      if (s.ws !== ws) return;
      setTabState(tabId, { conn: "connecting" });
    };

    ws.onmessage = (ev) => {
      if (s.ws !== ws) return;
      // Frame de controle/session vem como TEXT (JSON). O stream ao vivo do
      // pty vem como BINARY: decodifica com TextDecoder (bytes inválidos de
      // UTF-8 viram U+FFFD, que o xterm.js renderiza sem quebrar — e o
      // browser NÃO fecha a conexão com 1002 como faria num frame text).
      let text: string;
      if (typeof ev.data === "string") {
        text = ev.data;
      } else if (ev.data instanceof ArrayBuffer) {
        text = new TextDecoder("utf-8").decode(new Uint8Array(ev.data));
      } else {
        return;
      }

      if (!s.attached) {
        let ctrl: Record<string, unknown> | null = null;
        try { ctrl = JSON.parse(text) as Record<string, unknown>; } catch { ctrl = null; }
        if (ctrl && typeof ctrl === "object" && typeof ctrl.type === "string") {
          if (ctrl.type === "session") {
            const newSid = typeof ctrl.session_id === "string" ? ctrl.session_id : "";
            const created = ctrl.created === true;
            console.log(`[term] tab=${tabId} sessão sid=${newSid} created=${created} reattach=${!created}`);
            if (newSid) {
              s.serverSessionId = newSid;
              setTabState(tabId, { serverSessionId: newSid });
              const all = [...sessionsRef.current.values()];
                      writeTabs(all.map((x) => ({ id: x.id, sid: x.serverSessionId })), activeTabId);
            }
            setTabState(tabId, { conn: "live", note: "" });
            if (created) {
              s.liveListeners.forEach((fn) => { try { fn(); } catch { /* noop */ } });
            }
            return;
          }
          if (ctrl.type === "scrollback") {
            handleScrollback(tabId, ctrl.data);
            return;
          }
          if (ctrl.type === "ready") {
            s.attached = true;
            setTabState(tabId, { conn: "live", note: "" });
            return;
          }
          if (ctrl.type === "session_error") {
            setTabState(tabId, { conn: "offline", note: "Falha ao iniciar a sessão do terminal." });
            return;
          }
        }
      }

      // stream ao vivo (texto cru do pty)
      s.recent.push(text);
      if (s.recent.length > RECENT_MAX_CHUNKS) s.recent.shift();
      let total = 0;
      for (const c of s.recent) total += c.length;
      while (total > RECENT_MAX_CHARS && s.recent.length > 1) {
        s.recent.shift();
        total = 0;
        for (const c of s.recent) total += c.length;
      }
      s.outputListeners.forEach((fn) => { try { fn(text); } catch { /* noop */ } });
    };

    ws.onclose = (ev) => {
      if (s.ws === ws) s.ws = null;
      if (s.intentionalClose) return;
      console.log(`[term] tab=${tabId} ws close code=${ev?.code ?? "?"} reason=${JSON.stringify(ev?.reason ?? "")} session_id=${s.serverSessionId}`);
      s.attached = false;
      setTabState(tabId, { conn: "offline" });
      // FIX 22/08 (tarefa 3 — estabilização): reconectar SEMPRE com backoff,
      // inclusive com a aba oculta. Antes só reconectava quando o usuário
      // voltava (visibilitychange), deixando o terminal morto em fundo.
      // setTimeout roda throttled em background mas ainda dispara; ao voltar
      // para primeiro plano o visibilitychange dispara conexão imediata.
      scheduleReconnect(tabId);
    };

    ws.onerror = () => {
      if (s.ws !== ws) return;
      setTabState(tabId, { conn: "offline", note: "Falha na conexão com o servidor." });
    };
  };

  const connect = useCallback((tabId: string) => {
    getSession(tabId);
    connectInternal(tabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  const ensureConnected = useCallback((tabId: string) => {
    const s = sessionsRef.current.get(tabId);
    if (s?.ws && (s.ws.readyState === WebSocket.OPEN || s.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    connectInternal(tabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  const teardown = useCallback((tabId: string) => {
    teardownInternal(tabId);
    setTabState(tabId, { conn: "idle" });
  }, []);

  const write = useCallback((tabId: string, data: string) => {
    const s = sessionsRef.current.get(tabId);
    const ws = s?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data }));
    }
  }, []);

  const sendResize = useCallback((tabId: string, cols: number, rows: number) => {
    const s = sessionsRef.current.get(tabId);
    const ws = s?.ws;
    if (ws?.readyState === WebSocket.OPEN && cols > 0 && rows > 0) {
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  }, []);

  const subscribeOutput = useCallback((tabId: string, fn: (text: string) => void) => {
    const s = sessionsRef.current.get(tabId) ?? getSession(tabId);
    s.outputListeners.add(fn);
    return () => { s.outputListeners.delete(fn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  const subscribeReset = useCallback((tabId: string, fn: () => void) => {
    const s = sessionsRef.current.get(tabId) ?? getSession(tabId);
    s.resetListeners.add(fn);
    return () => { s.resetListeners.delete(fn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  const subscribeLive = useCallback((tabId: string, fn: () => void) => {
    const s = sessionsRef.current.get(tabId) ?? getSession(tabId);
    s.liveListeners.add(fn);
    return () => { s.liveListeners.delete(fn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  // Consumo DESTRUTIVO: devolve os chunks acumulados e limpa o buffer. O
  // consumidor (remount do TerminalTabBody) é único por aba — sem isso, cada
  // remount reescrevia as MESMAS chunks acumulando cópias na tela.
  const takeRecentOutput = useCallback((tabId: string) => {
    const s = sessionsRef.current.get(tabId);
    if (!s) return "";
    const out = s.recent.join("");
    s.recent = [];
    return out;
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
    const all = [...sessionsRef.current.values()];
    if (all.length) writeTabs(all.map((x) => ({ id: x.id, sid: x.serverSessionId })), id);
  }, []);

  const addTab = useCallback(() => {
    const id = newTabId();
    getSession(id);
    sessionsRef.current.get(id)!.wantNew = true;
    setTabs((prev) => [...prev, { id, serverSessionId: "", conn: "idle", note: "" }]);
    setActiveTabId(id);
    connectInternal(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  const removeTab = useCallback((tabId: string) => {
    teardownInternal(tabId);
    sessionsRef.current.delete(tabId);
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      return next;
    });
    setActiveTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = tabs.filter((t) => t.id !== tabId);
      return remaining[0]?.id ?? "";
    });
    const all = [...sessionsRef.current.values()];
    writeTabs(all.map((x) => ({ id: x.id, sid: x.serverSessionId })), activeTabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabId]);

  // Reconecta imediatamente ao voltar a aba/janela para primeiro plano
  // (suspensão do Android/Chrome mata o socket em background).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      sessionsRef.current.forEach((s) => {
        if (s.ws?.readyState !== WebSocket.OPEN && !s.intentionalClose) {
          connectInternal(s.id);
        }
      });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Mudança de settings (Server URL / HOK_TOKEN) em outra aba/janela →
  // reconecta todas as sessões com os valores novos.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) {
        sessionsRef.current.forEach((s) => connectInternal(s.id));
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const value: TerminalContextValue = {
    tabs, activeTabId, setActiveTab, addTab, removeTab,
    connect, ensureConnected, teardown, write, sendResize,
    subscribeOutput, subscribeReset, subscribeLive, takeRecentOutput,
  };

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error("useTerminal deve ser usado dentro de <TerminalProvider>");
  return ctx;
}
