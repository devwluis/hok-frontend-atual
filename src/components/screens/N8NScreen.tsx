"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Cog, Save, CheckCircle2, RefreshCw, AlertCircle, Workflow, ExternalLink,
} from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { cn } from "@/lib/utils";

const N8N_SETTINGS_KEY = "hokma.n8n.settings.v1";
const DEFAULT_N8N_BASE_URL = "https://n8n.imoveischaves.com";

// ── Types ─────────────────────────────────────────────────────────────────────
type N8NSettings = { baseUrl: string; defaultWebhookUrl: string };

type N8NWorkflow = {
  id: string;
  name: string;
  active: boolean;
  tags?: { id: string; name: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadSettings(): N8NSettings {
  try {
    const raw = localStorage.getItem(N8N_SETTINGS_KEY);
    if (!raw) return { baseUrl: DEFAULT_N8N_BASE_URL, defaultWebhookUrl: "" };
    const parsed = JSON.parse(raw) as Partial<N8NSettings>;
    return {
      baseUrl: parsed.baseUrl || DEFAULT_N8N_BASE_URL,
      defaultWebhookUrl: parsed.defaultWebhookUrl || "",
    };
  } catch {
    return { baseUrl: DEFAULT_N8N_BASE_URL, defaultWebhookUrl: "" };
  }
}

function persistSettings(data: N8NSettings) {
  localStorage.setItem(N8N_SETTINGS_KEY, JSON.stringify(data));
}

function readHokToken(): string {
  try {
    const raw = localStorage.getItem("hokma.settings.v1");
    if (!raw) return "";
    const s = JSON.parse(raw) as Record<string, string>;
    return s["HOK_TOKEN"] || "";
  } catch {
    return "";
  }
}

// ── WorkflowsPanel ────────────────────────────────────────────────────────────
function WorkflowsPanel({ baseUrl }: { baseUrl: string }) {
  const [workflows, setWorkflows] = useState<N8NWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Fetches workflows via the same-origin /api/n8n-proxy backend route.
   * This keeps X-N8N-API-KEY server-side and avoids CORS preflight issues.
   */
  const fetchWorkflows = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${window.location.origin}/api/n8n-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hok-Token": readHokToken(),
        },
        body: JSON.stringify({ baseUrl, token: "", path: "/api/v1/workflows?limit=100" }),
        signal: abortRef.current?.signal,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: `Erro ${res.status}` }))) as { error?: string };
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      const json = (await res.json()) as { data?: N8NWorkflow[]; workflows?: N8NWorkflow[] };
      const list = json.data ?? json.workflows ?? (Array.isArray(json) ? (json as unknown as N8NWorkflow[]) : []);
      setWorkflows(list);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Falha ao carregar workflows.");
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchWorkflows();
    return () => abortRef.current?.abort();
  }, [fetchWorkflows]);

  const activeCount = workflows.filter((w) => w.active).length;

  return (
    <div>
      {/* Header + refresh + stats */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
            ● {activeCount} ativos
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {workflows.length} total
          </span>
        </div>

        <button
          onClick={fetchWorkflows}
          disabled={loading}
          className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          aria-label="Atualizar"
          data-testid="button-n8n-refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-[12px]">{error}</span>
          <button onClick={fetchWorkflows} className="shrink-0 text-[11px] underline">Tentar novamente</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && workflows.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && workflows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum workflow encontrado.
        </div>
      )}

      {/* Workflow list */}
      <div className="space-y-2">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            data-testid="n8n-workflow-row"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 transition-colors hover:border-[color:var(--amber)]/20"
          >
            <Workflow className={cn(
              "h-4 w-4 shrink-0",
              wf.active ? "text-emerald-500" : "text-muted-foreground",
            )} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{wf.name}</span>
                <span className={cn(
                  "shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold",
                  wf.active
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-muted text-muted-foreground",
                )}>
                  {wf.active ? "ativo" : "inativo"}
                </span>
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                ID {wf.id}
                {wf.tags && wf.tags.length > 0 && (
                  <span className="ml-1.5">
                    {wf.tags.map((t) => `#${t.name}`).join(" ")}
                  </span>
                )}
              </div>
            </div>

            {baseUrl && (
              <a
                href={`${baseUrl.replace(/\/$/, "")}/workflow/${wf.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-xl bg-[color:var(--amber)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)] hover:opacity-90"
                data-testid="button-n8n-open"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir no N8N
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function N8NScreen() {
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultWebhookUrl, setDefaultWebhookUrl] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // "Live" credentials — updated only on save, so panel re-fetches only then
  const [liveBaseUrl, setLiveBaseUrl] = useState("");

  useEffect(() => {
    const s = loadSettings();
    setBaseUrl(s.baseUrl);
    setDefaultWebhookUrl(s.defaultWebhookUrl);
    setLiveBaseUrl(s.baseUrl);
  }, []);

  const handleSaveSettings = () => {
    persistSettings({ baseUrl, defaultWebhookUrl });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 1500);
    setLiveBaseUrl(baseUrl);
  };

  return (
    <ScreenFrame>
      <ScreenHeader title="N8N Automation" subtitle="Workflows do servidor em tempo real." />

      {/* ── Connection settings ── */}
      <Card className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color:var(--amber)]/15 text-[color:var(--amber)]">
            <Cog className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Conexão N8N</div>
            <div className="text-[11px] text-muted-foreground">URL base do servidor N8N</div>
          </div>
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
            liveBaseUrl ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground",
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", liveBaseUrl ? "bg-emerald-500" : "bg-muted-foreground")} />
            {liveBaseUrl ? "configurado" : "não configurado"}
          </span>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL Base N8N</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={DEFAULT_N8N_BASE_URL}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Webhook Padrão (chat)</label>
          <input
            value={defaultWebhookUrl}
            onChange={(e) => setDefaultWebhookUrl(e.target.value)}
            placeholder={`${DEFAULT_N8N_BASE_URL}/webhook/...`}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
          />
        </div>

        <button
          onClick={handleSaveSettings}
          data-testid="button-n8n-save"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--amber)] py-2.5 text-sm font-semibold text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)] hover:opacity-95 transition-opacity"
        >
          {settingsSaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {settingsSaved ? "Salvo!" : "Salvar Configurações"}
        </button>
      </Card>

      {/* ── Workflows (live from API) ── */}
      <WorkflowsPanel baseUrl={liveBaseUrl} />
    </ScreenFrame>
  );
}