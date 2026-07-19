"use client";
import { useState } from "react";
import { Eye, EyeOff, Check, Save, AlertCircle } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { usePersistentState } from "@/lib/use-persistent-state";

// Unified settings key — same as SettingsModal
const SETTINGS_KEY = "hokma.settings.v1";

const KEYS = [
  { k: "Server URL", placeholder: "https://api.hokma.dev", description: "URL base do servidor HOK externo" },
  { k: "HOK_TOKEN", placeholder: "hok_••••••••", description: "Token de autenticação do servidor" },
  { k: "DeepSeek", placeholder: "ds_•••", description: "API Key DeepSeek" },
  { k: "OpenRouter", placeholder: "or_•••", description: "API Key OpenRouter" },
  { k: "Gemini", placeholder: "gm_•••", description: "API Key Google Gemini" },
  { k: "OpenAI", placeholder: "sk_•••", description: "API Key OpenAI" },
  { k: "Groq", placeholder: "gq_•••", description: "API Key Groq (usado pelo AI interno)" },
  { k: "Anthropic", placeholder: "an_•••", description: "API Key Anthropic Claude" },
];

export function SettingsScreen() {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [vals, setVals] = usePersistentState<Record<string, string>>(SETTINGS_KEY, {});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});

  const markSaved = (k: string) => {
    setSavedAt((s) => ({ ...s, [k]: Date.now() }));
    setTimeout(() => {
      setSavedAt((s) => {
        const n = { ...s };
        delete n[k];
        return n;
      });
    }, 1500);
  };

  const serverUrl = vals["Server URL"] || "";
  const hokToken = vals["HOK_TOKEN"] || "";
  const showWarning = serverUrl && !hokToken;

  return (
    <ScreenFrame>
      <ScreenHeader title="Settings" subtitle="Conexões, tokens e chaves de API." />

      {showWarning && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Server URL configurado mas HOK_TOKEN está vazio. O chat usará apenas o AI interno.</span>
        </div>
      )}

      <Card className="space-y-4">
        {KEYS.map(({ k, placeholder, description }) => (
          <div key={k}>
            <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {k}
            </label>
            {description && (
              <p className="mb-1 text-[11px] text-muted-foreground/70">{description}</p>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={shown[k] ? "text" : "password"}
                  value={vals[k] ?? ""}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-9 text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
                />
                <button
                  onClick={() => setShown((s) => ({ ...s, [k]: !s[k] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={shown[k] ? "Ocultar" : "Mostrar"}
                >
                  {shown[k] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                onClick={() => markSaved(k)}
                className="inline-flex items-center gap-1 rounded-xl bg-[color:var(--amber)] px-3 py-2 text-xs font-semibold text-[color:var(--amber-foreground)] hover:opacity-95 transition-opacity"
              >
                {savedAt[k] ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {savedAt[k] ? "Salvo" : "Salvar"}
              </button>
            </div>
          </div>
        ))}
      </Card>

      <div className="mt-4 rounded-xl border border-border bg-card/50 px-4 py-3 text-[11px] text-muted-foreground">
        <strong>Dica de segurança:</strong> As chaves são salvas localmente no seu dispositivo (localStorage).
        Nunca compartilhe este dispositivo com acesso ao navegador sem bloquear a sessão.
      </div>
    </ScreenFrame>
  );
}
