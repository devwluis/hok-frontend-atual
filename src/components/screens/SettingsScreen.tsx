"use client";
import { useState, useEffect } from "react";
import { Eye, EyeOff, Check, Save, AlertCircle, Server } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { usePersistentState } from "@/lib/use-persistent-state";
import { hokGet } from "@/lib/hok-api";

// Unified settings key — same as SettingsModal
const SETTINGS_KEY = "hokma.settings.v1";

// Mapeia campos da tela para as chaves do backend (GET /settings devolve
// <key>Configured como boolean — sem valores em texto puro)
const SERVER_KEY_MAP: Record<string, string> = {
  DeepSeek: "deepseekKey",
  OpenRouter: "openrouterKey",
  Gemini: "geminiKey",
  OpenAI: "openaiKey",
  Groq: "groqKey",
  Anthropic: "anthropicKey",
};

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
  const [credits, setCredits] = useState<{
    usage_monthly: number;
    limit: number | null;
    limit_remaining: number | null;
    balance?: number;
    total_credits?: number;
    total_usage?: number;
  } | null>(null);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [serverConfigured, setServerConfigured] = useState<Record<string, boolean> | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

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

  useEffect(() => {
    const url = (vals["Server URL"] || window.location.origin).replace(/\/$/, "");
    const token = vals["HOK_TOKEN"] || "";
    if (!token) return;
    fetch(`${url}/openrouter/credits`, { headers: { "X-Hok-Token": token } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => setCredits(d))
      .catch((e) => setCreditsError(e instanceof Error ? e.message : "Erro desconhecido"));
  }, [vals]);
  const serverUrl = vals["Server URL"] || "";
  const hokToken = vals["HOK_TOKEN"] || "";
  const showWarning = serverUrl && !hokToken;

  useEffect(() => {
    let active = true;
    if (!hokToken) return;
    hokGet<{ settings: Record<string, unknown>; status: string }>("/settings").then((res) => {
      if (!active) return;
      if (res.ok) {
        setServerError(null);
        setServerConfigured(res.data.settings as Record<string, boolean>);
      } else {
        setServerError(res.error);
        setServerConfigured(null);
      }
    });
    return () => { active = false; };
  }, [hokToken, serverUrl]);

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
        {KEYS.map(({ k, placeholder, description }) => {
          const serverKey = SERVER_KEY_MAP[k];
          const configured = serverKey ? serverConfigured?.[serverKey + "Configured"] : undefined;
          return (
          <div key={k}>
            <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {k}
            </label>
            {description && (
              <p className="mb-1 text-[11px] text-muted-foreground/70">{description}</p>
            )}
            {serverKey && serverConfigured && (
              <span className={`mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${configured ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                <Server className="h-3 w-3" />
                {configured ? "Configurado no servidor" : "Não configurado no servidor"}
              </span>
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
          );
        })}
      </Card>
      {serverError && (
        <div className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Estado do servidor indisponível: {serverError}
        </div>
      )}
      <Card className="mt-4 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          💳 OpenRouter
        </h3>
        {creditsError && (
          <p className="text-xs text-destructive">Nao foi possivel carregar: {creditsError}</p>
        )}
        {!creditsError && !credits && (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        )}
        {credits && (
          <div className="space-y-1 text-sm">
            {credits.balance != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo</span>
                <span className="font-mono font-semibold text-base">${credits.balance.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gasto este mes</span>
              <span className="font-mono">${credits.usage_monthly.toFixed(2)}</span>
            </div>
            {credits.total_credits != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total comprado</span>
                <span className="font-mono">${credits.total_credits.toFixed(2)}</span>
              </div>
            )}
            {credits.limit != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Limite da chave</span>
                <span className="font-mono">${credits.limit.toFixed(2)}</span>
              </div>
            )}
            {credits.limit_remaining != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restante (chave)</span>
                <span className="font-mono">${credits.limit_remaining.toFixed(2)}</span>
              </div>
            )}
            {credits.limit == null && credits.balance == null && (
              <p className="text-[11px] text-muted-foreground/70">Esta chave nao tem limite configurado.</p>
            )}
          </div>
        )}
      </Card>

      <div className="mt-4 rounded-xl border border-border bg-card/50 px-4 py-3 text-[11px] text-muted-foreground">
        <strong>Dica de segurança:</strong> As chaves são salvas localmente no seu dispositivo (localStorage).
        Nunca compartilhe este dispositivo com acesso ao navegador sem bloquear a sessão.
      </div>
    </ScreenFrame>
  );
}
