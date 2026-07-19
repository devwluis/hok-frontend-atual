export type HokModel = {
  id: string;
  label: string;
  provider: string;
  color: string;
  description: string;
};

export const HOK_MODELS: HokModel[] = [
  {
    id: "auto",
    label: "Auto",
    provider: "HOK",
    color: "#F5A623",
    description: "HOK escolhe o modelo ideal para cada tarefa",
  },
  {
    id: "nousresearch/hermes-4-70b",
    label: "Hermes 4",
    provider: "OpenRouter",
    color: "#8b5cf6",
    description: "Hermes-4 70B — raciocínio e código complexo",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    provider: "Cerebras",
    color: "#ef4444",
    description: "Ultra-rápido — ideal para iterações rápidas",
  },
  {
    id: "groq",
    label: "Groq",
    provider: "Groq",
    color: "#22c55e",
    description: "Llama 3.3 70B — velocidade + qualidade",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini",
    provider: "Google",
    color: "#3b82f6",
    description: "Gemini 2.5 Flash — multimodal e contexto longo",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini Lite",
    provider: "Google",
    color: "#60a5fa",
    description: "Gemini Flash Lite — leve para tarefas simples",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    provider: "DeepSeek",
    color: "#06b6d4",
    description: "DeepSeek — código e análise técnica",
  },
];

export function getModel(id: string): HokModel {
  return HOK_MODELS.find((m) => m.id === id) ?? HOK_MODELS[0];
}
