export type ScreenId =
  | "chat"
  | "terminal"
  | "n8n"
  | "preview"
  | "brain"
  | "models"
  | "settings"
  | "session"
  | "agent"
  | "memory"
  | "deploy"
  | "github"
  | "dbstudio"
  | "metrics"
  | "files"
  | "codex"
  | "flow"
  | "crm";

type StoreState = {
  screen: ScreenId;
  drawerOpen: boolean;
  settingsOpen: boolean;
  conversationId: string | null;
};

const listeners = new Set<() => void>();
let state: StoreState = {
  screen: "chat",
  drawerOpen: false,
  settingsOpen: false,
  conversationId: null,
};

export const appStore = {
  get: (): StoreState => state,
  set: (patch: Partial<StoreState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
