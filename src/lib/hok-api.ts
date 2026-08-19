const CONV_ID_KEY = "hokma.conversation_id";

function getOrCreateConversationId(): string {
  let convId = localStorage.getItem(CONV_ID_KEY);
  if (!convId) {
    convId = "conv_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(CONV_ID_KEY, convId);
  }
  return convId;
}

const SETTINGS_KEY = "hokma.settings.v1";

export function readSettings(): { serverUrl: string; token: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { serverUrl: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return { serverUrl: s["Server URL"] || "", token: s["HOK_TOKEN"] || "" };
  } catch {
    return { serverUrl: "", token: "" };
  }
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function hokGet<T>(path: string): Promise<ApiResult<T>> {
  const { serverUrl, token } = readSettings();
  if (!serverUrl) return { ok: false, error: "Server URL não configurado nas Configurações" };
  const url = serverUrl.replace(/\/$/, "") + path;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Conversation-Id": getOrCreateConversationId(),
  };
  if (token) headers["X-Hok-Token"] = token;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede" };
  }
}

export async function hokDelete<T = { status?: string }>(path: string): Promise<ApiResult<T>> {
  const { serverUrl, token } = readSettings();
  if (!serverUrl) return { ok: false, error: "Server URL não configurado nas Configurações" };
  const url = serverUrl.replace(/\/$/, "") + path;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Conversation-Id": getOrCreateConversationId(),
  };
  if (token) headers["X-Hok-Token"] = token;
  try {
    const res = await fetch(url, { method: "DELETE", headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede" };
  }
}