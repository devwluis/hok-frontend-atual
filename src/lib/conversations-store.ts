const KEY = "hokma.conversations.v1";

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
  },

  remove(id: string): void {
    save(load().filter((c) => c.id !== id));
  },

  rename(id: string, title: string): void {
    const list = load();
    const c = list.find((x) => x.id === id);
    if (c) { c.title = title; save(list); }
  },
};
