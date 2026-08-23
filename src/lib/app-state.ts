export type ScreenId =
  | "chat"
  | "terminal"
  | "n8n"
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
  // FIX kbhide (23/08): teclado do sistema aberto na tela Terminal — o Dock
  // se oculta para não sobrepor a barra de teclas especiais.
  keyboardOpen: boolean;
};

const listeners = new Set<() => void>();
let state: StoreState = {
  screen: "chat",
  drawerOpen: false,
  settingsOpen: false,
  conversationId: null,
  keyboardOpen: false,
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
