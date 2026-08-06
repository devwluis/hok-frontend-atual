const SETTINGS_KEY = "hokma.settings.v1";

const DEFAULT_SETTINGS: Record<string, string> = {
  "Server URL": "https://app.imoveischaves.com", // troque pro seu server URL real
  "HOK_TOKEN": "5fae643bbee6b44c3da66a9099524bf4b6e53cd966aa373fba8764e517c85591",  // edite direto aqui no servidor
};

export function ensureDefaultSettings() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
      return;
    }
    // se já existe mas está faltando algum campo essencial, faz merge sem sobrescrever o que o usuário salvou
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    if (!parsed["Server URL"] || !parsed["HOK_TOKEN"]) {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    }
  } catch {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }
}
