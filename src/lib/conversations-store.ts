const KEY = "hokma.conversations.v1";
const SETTINGS_KEY = "hokma.settings.v1";
const TOMBSTONES_KEY = "hokma.conversations.deleted.v1";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

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

async function apiFetch(path: string, opts: RequestInit = {}) {
  const { serverUrl, token } = readSettings();
  if (!serverUrl) throw new Error("Server URL não configurado");
  const url = serverUrl.replace(/\/$/, "") + path;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers["X-Hok-Token"] = token;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.status) throw new Error(`HTTP ${res.status}`);
  return data;
}

function load(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list: Conversation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

function loadTombstones(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(TOMBSTONES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveTombstones(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(Array.from(ids)));
}

function addTombstone(id: string) {
  const t = loadTombstones();
  t.add(id);
  saveTombstones(t);
}

function clearTombstone(id: string) {
  const t = loadTombstones();
  t.delete(id);
  saveTombstones(t);
}

function toBackend(c: Conversation) {
  return {
    id: c.id,
    title: c.title,
    project: "default",
    model: "default",
    messages: c.messages.map((m, i) => ({
      id: m.id,
      role: m.role,
      content: m.text,
      ts: c.updatedAt - (c.messages.length - i),
    })),
  };
}

function fromBackendConv(r: Record<string, string>): Conversation {
  return {
    id: r.id,
    title: r.title || "Nova conversa",
    updatedAt: Number(r.updated_at) * 1000 || Date.now(),
    messages: [],
  };
}

function pushToServer(c: Conversation) {
  apiFetch("/conversations", {
    method: "POST",
    body: JSON.stringify(toBackend(c)),
  }).catch((e) => console.warn("sync conversa falhou:", e));
}

async function deleteFromServer(id: string): Promise<boolean> {
  try {
    await apiFetch(`/conversations/${id}`, { method: "DELETE" });
    return true;
  } catch (e) {
    console.warn("delete remoto falhou:", e);
    return false;
  }
}

export async function hydrateFromServer(): Promise<void> {
  try {
    const resp = await apiFetch("/conversations");
    const remote: Conversation[] = (resp.conversations || []).map(fromBackendConv);
    const local = load();
    const tombstones = loadTombstones();
    const merged = new Map<string, Conversation>();
    for (const c of local) merged.set(c.id, c);
    for (const r of remote) {
      if (tombstones.has(r.id)) continue; // apagada de propósito, não reinsere
      const existing = merged.get(r.id);
      if (!existing || r.updatedAt > existing.updatedAt) {
        if (existing) r.messages = existing.messages;
        merged.set(r.id, r);
      }
    }
    save(Array.from(merged.values()));

    // tenta reprocessar deletes pendentes (ex: estava offline)
    for (const id of tombstones) {
      const stillOnServer = remote.some((r) => r.id === id);
      if (stillOnServer) {
        const ok = await deleteFromServer(id);
        if (ok) clearTombstone(id);
      } else {
        clearTombstone(id);
      }
    }
  } catch (e) {
    console.warn("hidratação de conversas falhou (offline?):", e);
  }
}

export async function hydrateMessages(id: string): Promise<void> {
  try {
    const resp = await apiFetch(`/conversations/${id}/messages`);
    const msgs: ChatMessage[] = (resp.messages || []).map((m: Record<string, string>) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      text: m.content,
    }));
    const list = load();
    const c = list.find((x) => x.id === id);
    if (c && msgs.length > 0) {
      c.messages = msgs;
      save(list);
    }
  } catch (e) {
    console.warn("hidratação de mensagens falhou:", e);
  }
}

export const conversationsStore = {
  list(): Conversation[] {
    return load().sort((a, b) => b.updatedAt - a.updatedAt);
  },

  get(id: string): Conversation | undefined {
    return load().find((c) => c.id === id);
  },

  create(firstMessage = "Nova conversa"): Conversation {
    const c: Conversation = {
      id: crypto.randomUUID(),
      title: firstMessage.slice(0, 40) || "Nova conversa",
      updatedAt: Date.now(),
      messages: [],
    };
    const list = load();
    list.push(c);
    save(list);
    pushToServer(c);
    return c;
  },

  upsert(c: Conversation): void {
    const list = load();
    const idx = list.findIndex((x) => x.id === c.id);
    if (idx >= 0) {
      list[idx] = c;
    } else {
      list.push(c);
    }
    save(list);
    pushToServer(c);
  },

  async remove(id: string): Promise<void> {
    save(load().filter((c) => c.id !== id));
    addTombstone(id); // garante que não volta mesmo se o delete remoto ainda não confirmou
    const ok = await deleteFromServer(id);
    if (ok) clearTombstone(id);
  },

  rename(id: string, title: string): void {
    const list = load();
    const c = list.find((x) => x.id === id);
    if (c) {
      c.title = title;
      save(list);
      pushToServer(c);
    }
  },
};
