export type HokModel = { id: string; label: string; provider: string; color: string; description: string; free: boolean; };

export const FALLBACK_MODELS: HokModel[] = [
  { id: "auto", label: "Auto", provider: "HOK", color: "#F5A623", description: "HOK escolhe o modelo ideal para cada tarefa", free: true },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek Chat v3.1", provider: "OpenCode Zen", color: "#06b6d4", description: "DeepSeek Chat v3.1 — gratuito via OpenCode Zen", free: true },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "OpenRouter", color: "#3b82f6", description: "Gemini 2.5 Flash — multimodal e contexto longo", free: false },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini Lite", provider: "OpenRouter", color: "#60a5fa", description: "Gemini Flash Lite — leve para tarefas simples", free: true },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek Chat v3.1", provider: "OpenRouter", color: "#06b6d4", description: "DeepSeek Chat v3.1 — código e análise técnica", free: true },
];

let modelsCache: HokModel[] | null = null;
let cachePromise: Promise<HokModel[]> | null = null;
let modelsFetchedAt = 0;
const MODELS_TTL_MS = 60_000;

const MODEL_COLORS: Record<string, string> = {
  "OpenCode Zen": "#a855f7",
  "OpenRouter": "#f97316",
  "Google": "#3b82f6",
  "OpenAI": "#10a37f",
  "Anthropic": "#d97706",
  "Meta": "#1877f2",
  "Mistral": "#ff6b35",
  "Cohere": "#f97316",
  "Qwen": "#ff6b35",
  "DeepSeek": "#06b6d4",
  "MiniMax": "#ff6b35",
  "GLM": "#ff6b35",
  "Kimi": "#ff6b35",
  "Muse": "#a855f7",
  "Nemotron": "#a855f7",
  "Jamba": "#ff6b35",
};

function getColorForProvider(provider: string, fallback: string): string {
  return MODEL_COLORS[provider] || fallback;
}

function mapApiModelToHokModel(apiModel: any): HokModel {
  const provider = apiModel.provider || "OpenRouter";
  const fallbackColor = apiModel.free ? "#22c55e" : "#f97316";
  return {
    id: apiModel.id,
    label: apiModel.label || apiModel.id,
    provider,
    color: getColorForProvider(provider, fallbackColor),
    description: `${apiModel.label || apiModel.id} — ${apiModel.free ? "gratuito" : "pago"} via ${provider}`,
    free: apiModel.free,
  };
}

function readSettings(): { serverUrl: string; token: string } {
  try {
    const raw = localStorage.getItem("hokma.settings.v1");
    if (!raw) return { serverUrl: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return { serverUrl: s["Server URL"] || "", token: s["HOK_TOKEN"] || "" };
  } catch {
    return { serverUrl: "", token: "" };
  }
}

async function fetchModelsFromAPI(): Promise<HokModel[]> {
  const { serverUrl, token } = readSettings();
  if (!token) {
    console.warn("[hok-models] Sem token, usando fallback");
    return FALLBACK_MODELS;
  }
  const baseUrl = serverUrl || window.location.origin;
  try {
    const res = await fetch(`${baseUrl}/models/catalog`, {
      headers: { "X-Hok-Token": token },
    });
    if (!res.ok) {
      console.warn("[hok-models] Falha ao buscar catálogo:", res.status);
      return FALLBACK_MODELS;
    }
    const data = await res.json();
    if (data.status !== "ok" || !data.providers) {
      console.warn("[hok-models] Resposta inválida do catálogo");
      return FALLBACK_MODELS;
    }
    const models: HokModel[] = [
      { id: "auto", label: "Auto", provider: "HOK", color: "#F5A623", description: "HOK escolhe o modelo ideal para cada tarefa", free: true },
    ];
    for (const pg of data.providers) {
      for (const m of pg.models) {
        models.push(mapApiModelToHokModel(m));
      }
    }
    if (typeof data.active === "string" && data.active) {
      (models as unknown as { _active?: string })._active = data.active;
    }
    return models;
  } catch (e) {
    console.error("[hok-models] Erro ao buscar catálogo:", e);
    return FALLBACK_MODELS;
  }
}

export async function getModels(force = false): Promise<HokModel[]> {
  if (!force && modelsCache && Date.now() - modelsFetchedAt < MODELS_TTL_MS) return modelsCache;
  if (!cachePromise) {
    cachePromise = fetchModelsFromAPI().then((m) => {
      modelsCache = m;
      modelsFetchedAt = Date.now();
      return m;
    });
  }
  return cachePromise;
}

export function invalidateModelsCache(): void {
  modelsCache = null;
  cachePromise = null;
  modelsFetchedAt = 0;
}

function prettyLabelFromId(id: string): string {
  const last = id.split("/").pop() ?? id;
  return last
    .split(/[-_]/)
    .map((w) => {
      if (!w) return "";
      if (/^v?\d/.test(w)) return w.charAt(0).toUpperCase() + w.slice(1);
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function getModel(id: string): HokModel {
  if (id === "auto") return FALLBACK_MODELS[0];
  const found = modelsCache?.find((x) => x.id === id) ?? FALLBACK_MODELS.find((x) => x.id === id);
  if (found) return found;
  const provider = id.split("/")[0] ?? "OpenRouter";
  return {
    id,
    label: prettyLabelFromId(id),
    provider,
    color: getColorForProvider(provider, "#f97316"),
    description: `${id} — fornecido via ${provider}`,
    free: false,
  };
}

export async function isModelFree(id: string): Promise<boolean> {
  const m = await getModels();
  return (m.find((x) => x.id === id) ?? m[0]).free;
}

export async function getFreeModels(force = false): Promise<HokModel[]> {
  const models = await getModels(force);
  return models.filter((x) => x.free);
}

export async function getPaidModels(force = false): Promise<HokModel[]> {
  const models = await getModels(force);
  return models.filter((x) => !x.free && x.provider !== "OpenCode Zen");
}

export async function getZenModels(force = false): Promise<HokModel[]> {
  const models = await getModels(force);
  return models.filter((x) => x.provider === "OpenCode Zen");
}