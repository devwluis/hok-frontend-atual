"use client";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff, Check, Save, AlertCircle, Server, RefreshCw, Zap, Wallet } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { usePersistentState } from "@/lib/use-persistent-state";
import { hokGet } from "@/lib/hok-api";
import { useOpenRouterCredits } from "@/hooks/use-openrouter-credits";
import { useOpenCodeStatus } from "@/hooks/use-opencode-status";
import { cn } from "@/lib/utils";

// Unified settings key — same as SettingsModal
const SETTINGS_KEY = "hokma.settings.v1";

// ── FASE 4 — temas de cores do terminal ──
// Persistido em localStorage "hokma.terminal.theme.v1" e propagado ao
// TerminalScreen via CustomEvent (mesma aba) — o xterm aplica em runtime.
export const TERMINAL_THEME_KEY = "hokma.terminal.theme.v1";
export const TERMINAL_THEME_EVENT = "hokma:terminal-theme";
export const TERMINAL_THEMES: Record<string, { name: string; colors: string[]; theme: Record<string, string> }> = {
  // TESTE 2 — paletas Termius-like e High Contrast
  termius: {
    name: "Termius-like",
    colors: ["#011627", "#d6deeb", "#ffcb8b", "#ef5350"],
    theme: {
      background: "#011627", foreground: "#d6deeb", cursor: "#ffcb8b", cursorAccent: "#011627",
      selectionBackground: "#1d3b53", black: "#011627", red: "#ef5350", green: "#ecc48d", yellow: "#ffeb95",
      blue: "#82aaff", magenta: "#c792ea", cyan: "#7fdbca", white: "#d6deeb",
      brightBlack: "#5f7e97", brightRed: "#ff5370", brightGreen: "#addb67", brightYellow: "#ffcb8b",
      brightBlue: "#82aaff", brightMagenta: "#c792ea", brightCyan: "#7fdbca", brightWhite: "#ffffff",
    },
  },
  highcontrast: {
    name: "High Contrast",
    colors: ["#000000", "#ffffff", "#ffff00", "#ff4040"],
    theme: {
      background: "#000000", foreground: "#ffffff", cursor: "#ffff00", cursorAccent: "#000000",
      selectionBackground: "#ffff0044", black: "#000000", red: "#ff3030", green: "#30ff30", yellow: "#ffff30",
      blue: "#3080ff", magenta: "#ff30ff", cyan: "#30ffff", white: "#ffffff",
      brightBlack: "#909090", brightRed: "#ff5050", brightGreen: "#50ff50", brightYellow: "#ffff50",
      brightBlue: "#60b0ff", brightMagenta: "#ff60ff", brightCyan: "#50ffff", brightWhite: "#ffffff",
    },
  },
  dark: {
    name: "HOK Dark",
    colors: ["#0d1117", "#6ee7b7", "#34d399", "#f87171"],
    theme: {
      background: "#0d1117", foreground: "#6ee7b7", cursor: "#34d399", cursorAccent: "#0d1117",
      selectionBackground: "#34d39933", black: "#0d1117", red: "#f87171", green: "#34d399", yellow: "#f5b942",
      blue: "#60a5fa", magenta: "#a78bfa", cyan: "#22d3ee", white: "#e5e7eb",
      brightBlack: "#4b5563", brightRed: "#f87171", brightGreen: "#6ee7b7", brightYellow: "#fde68a",
      brightBlue: "#93c5fd", brightMagenta: "#c4b5fd", brightCyan: "#67e8f9", brightWhite: "#ffffff",
    },
  },
  solarized: {
    name: "Solarized Dark",
    colors: ["#002b36", "#93a1a1", "#b58900", "#dc322f"],
    theme: {
      background: "#002b36", foreground: "#93a1a1", cursor: "#b58900", cursorAccent: "#002b36",
      selectionBackground: "#07364299", black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#859900", brightYellow: "#b58900",
      brightBlue: "#268bd2", brightMagenta: "#6c71c4", brightCyan: "#2aa198", brightWhite: "#fdf6e3",
    },
  },
  contrast: {
    name: "Alto Contraste",
    colors: ["#000000", "#ffffff", "#00ff00", "#ff4444"],
    theme: {
      background: "#000000", foreground: "#ffffff", cursor: "#00ff00", cursorAccent: "#000000",
      selectionBackground: "#ffffff33", black: "#000000", red: "#ff4444", green: "#44ff44", yellow: "#ffff44",
      blue: "#4488ff", magenta: "#ff44ff", cyan: "#44ffff", white: "#ffffff",
      brightBlack: "#666666", brightRed: "#ff6666", brightGreen: "#66ff66", brightYellow: "#ffff66",
      brightBlue: "#66aaff", brightMagenta: "#ff66ff", brightCyan: "#66ffff", brightWhite: "#ffffff",
    },
  },
};
export function readTerminalTheme(): string {
  try { return localStorage.getItem(TERMINAL_THEME_KEY) || "dark"; } catch { return "dark"; }
}

// Mapeia campos da tela para as chaves do backend (GET /settings devolve
// <key>Configured como boolean — sem valores em texto puro)
const SERVER_KEY_MAP: Record<string, string> = {
  OpenRouter: "openrouterKey",
};

// Painel enxuto para clientes: apenas conexão do servidor + chave OpenRouter.
// As demais chaves de provedores são configuradas no servidor (server-side).
const KEYS = [
  { k: "Server URL", placeholder: "https://api.hokma.dev", description: "URL base do servidor HOK externo" },
  { k: "HOK_TOKEN", placeholder: "hok_••••••••", description: "Token de autenticação do servidor" },
  { k: "OpenRouter", placeholder: "or_•••", description: "API Key OpenRouter (para o painel de créditos)" },
];

function formatReset(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CreditCardHeader({ icon, title, subtitle, onRefresh, loading, statusBadge, refreshTestId }: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onRefresh: () => void;
  loading?: boolean;
  statusBadge?: ReactNode;
  refreshTestId: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {statusBadge}
          </div>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <button
        onClick={onRefresh}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--amber)]/10 hover:text-[color:var(--amber)]"
        aria-label="Sincronizar"
        data-testid={refreshTestId}
      >
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
      </button>
    </div>
  );
}

function CreditGridCell({ label, value, highlight, danger }: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl px-3 py-2.5",
      danger ? "border border-red-500/20 bg-red-500/10"
        : highlight ? "border border-emerald-500/20 bg-emerald-500/10"
        : "bg-muted/60",
    )}>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 font-mono text-sm font-semibold",
        danger ? "text-red-400" : highlight ? "text-emerald-400" : "text-foreground",
      )}>
        {value}
      </p>
    </div>
  );
}

export function SettingsScreen() {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [vals, setVals] = usePersistentState<Record<string, string>>(SETTINGS_KEY, {});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [serverConfigured, setServerConfigured] = useState<Record<string, boolean> | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const credits = useOpenRouterCredits();
  const opencode = useOpenCodeStatus();

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
      <ScreenHeader title="Settings" subtitle="Conexões, tokens e consumo do servidor." />

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

      {/* ── FASE 4 — Tema de cores do terminal ── */}
      <Card className="mt-4 space-y-3">
        <div>
          <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tema do Terminal
          </label>
          <p className="mb-2 text-[11px] text-muted-foreground/70">
            Cores do terminal (xterm.js) — aplica na hora, sem reconectar.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(TERMINAL_THEMES).map(([key, t]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                try { localStorage.setItem(TERMINAL_THEME_KEY, key); } catch { /* noop */ }
                window.dispatchEvent(new CustomEvent(TERMINAL_THEME_EVENT, { detail: { theme: key } }));
                markSaved("Terminal Theme");
              }}
              data-testid={`theme-${key}`}
              className={cn(
                "rounded-xl border px-2 py-2 text-left transition-colors",
                (vals["Terminal Theme"] || readTerminalTheme()) === key
                  ? "border-[color:var(--amber)] shadow-[var(--shadow-amber-glow)]"
                  : "border-border hover:bg-accent",
              )}
            >
              <div className="mb-1.5 flex gap-1">
                {t.colors.map((c) => (
                  <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
                ))}
              </div>
              <span className="text-[11px] font-semibold">{t.name}</span>
            </button>
          ))}
        </div>
      </Card>
      {serverError && (
        <div className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Estado do servidor indisponível: {serverError}
        </div>
      )}

      {/* ── Card Créditos OpenRouter ── */}
      <Card className="mt-4 space-y-3">
        <CreditCardHeader
          icon={<Wallet className="h-5 w-5" />}
          title="Créditos OpenRouter"
          subtitle="Saldo da chave do servidor"
          onRefresh={credits.refresh}
          loading={credits.loading}
          refreshTestId="button-credits-refresh"
        />
        {credits.error && (
          <p className="text-xs text-destructive">Não foi possível carregar: {credits.error}</p>
        )}
        {!credits.error && !credits.data && (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        )}
        {credits.data && (() => {
          const d = credits.data;
          const total = d.total_credits ?? (d.balance ?? 0) + (d.usage_total ?? 0);
          const saldo = d.balance != null
            ? d.balance
            : Math.max(0, total - (d.usage_total ?? d.usage_monthly ?? 0));
          const gasto = Math.max(0, total - saldo);
          const detail = [
            credits.data.usage_monthly != null && `mês: $${credits.data.usage_monthly.toFixed(2)}`,
            credits.data.usage_weekly != null && `semana: $${credits.data.usage_weekly.toFixed(2)}`,
            credits.data.usage_daily != null && `dia: $${credits.data.usage_daily.toFixed(2)}`,
          ].filter(Boolean).join(" · ");
          return (
            <>
              <div className="grid grid-cols-3 gap-2">
                <CreditGridCell label="Total carregado" value={`$${total.toFixed(2)}`} />
                <CreditGridCell label="Gasto até o momento" value={`$${gasto.toFixed(2)}`} danger />
                <CreditGridCell label="Saldo atual" value={`$${saldo.toFixed(2)}`} highlight />
              </div>
              {detail && (
                <p className="text-[10px] text-muted-foreground/70">Uso no mês: {detail}</p>
              )}
            </>
          );
        })()}
      </Card>

      {/* ── Card Créditos OpenCode Go ── */}
      <Card className="mt-4 space-y-3">
        <CreditCardHeader
          icon={<Zap className="h-5 w-5" />}
          title="Créditos OpenCode Go"
          subtitle="Assinatura do plano Go · renovação mensal"
          onRefresh={opencode.refresh}
          loading={opencode.loading}
          refreshTestId="button-opencode-refresh"
          statusBadge={opencode.data?.subscribed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ativo
            </span>
          ) : undefined}
        />
        {opencode.error && (
          <p className="text-xs text-destructive">{opencode.error}</p>
        )}
        {!opencode.error && !opencode.data && (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        )}
        {opencode.data && !opencode.data.subscribed && (
          <p className="text-xs text-muted-foreground">Sem assinatura OpenCode Go ativa.</p>
        )}
        {opencode.data && opencode.data.subscribed && opencode.data.monthly && (() => {
          const total = opencode.data.monthly.limitDollars;
          const gasto = opencode.data.monthly.usedDollars;
          const saldo = Math.max(0, total - gasto);
          const detail = [
            `mês: $${opencode.data.monthly.usedDollars.toFixed(2)}`,
            opencode.data.rolling && `5h: $${opencode.data.rolling.usedDollars.toFixed(2)}`,
            opencode.data.weekly && `semana: $${opencode.data.weekly.usedDollars.toFixed(2)}`,
          ].filter(Boolean).join(" · ");
          return (
            <>
              <div className="grid grid-cols-3 gap-2">
                <CreditGridCell label="Total carregado" value={`$${total.toFixed(2)}`} />
                <CreditGridCell label="Gasto até o momento" value={`$${gasto.toFixed(2)}`} danger />
                <CreditGridCell label="Saldo atual" value={`$${saldo.toFixed(2)}`} highlight />
              </div>
              {detail && (
                <p className="text-[10px] text-muted-foreground/70">Uso no mês: {detail}</p>
              )}
              <p className="text-[10px] text-muted-foreground/70">
                Renovação: {formatReset(opencode.data.monthly.resetsAt)}
              </p>
            </>
          );
        })()}
      </Card>

      <div className="mt-4 rounded-xl border border-border bg-card/50 px-4 py-3 text-[11px] text-muted-foreground">
        <strong>Dica de segurança:</strong> As chaves são salvas localmente no seu dispositivo (localStorage).
        Nunca compartilhe este dispositivo com acesso ao navegador sem bloquear a sessão.
      </div>
    </ScreenFrame>
  );
}