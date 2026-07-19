"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Cog, Eye, EyeOff, Save, Send, CheckCircle2, Clock,
  AlertCircle, Plus, Trash2, Pencil, Check, RefreshCw,
  Workflow, Zap, Search, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ScreenFrame, ScreenHeader, Card, Chip } from "@/components/shell/ScreenFrame";
import { cn } from "@/lib/utils";

const N8N_SETTINGS_KEY  = "hokma.n8n.settings.v1";
const WEBHOOKS_KEY      = "hokma.n8n.webhooks.v1";

// ── Types ─────────────────────────────────────────────────────────────────────
type N8NSettings = { baseUrl: string; token: string; defaultWebhookUrl: string };

type N8NNode = {
  type: string;
  name: string;
  parameters?: {
    path?: string;
    httpMethod?: string;
    method?: string;
  };
};

type N8NWorkflow = {
  id: string;
  name: string;
  active: boolean;
  nodes: N8NNode[];
  updatedAt?: string;
  createdAt?: string;
  tags?: { id: string; name: string }[];
};

type SavedWebhook = { id: string; name: string; url: string; method: "POST" | "GET" };
type ExecEntry   = { id: string; status: "ok" | "err"; time: string; url: string; code: number };

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadSettings(): N8NSettings {
  try {
    const raw = localStorage.getItem(N8N_SETTINGS_KEY);
    if (!raw) return { baseUrl: "", token: "", defaultWebhookUrl: "" };
    return { baseUrl: "", token: "", defaultWebhookUrl: "", ...(JSON.parse(raw) as Partial<N8NSettings>) };
  } catch { return { baseUrl: "", token: "", defaultWebhookUrl: "" }; }
}
function persistSettings(data: N8NSettings) {
  localStorage.setItem(N8N_SETTINGS_KEY, JSON.stringify(data));
}
function loadWebhooks(): SavedWebhook[] {
  try {
    const raw = localStorage.getItem(WEBHOOKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedWebhook[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveWebhooks(list: SavedWebhook[]) {
  localStorage.setItem(WEBHOOKS_KEY, JSON.stringify(list));
}

/** Extract all webhook-trigger nodes from a workflow */
function extractWebhookNodes(wf: N8NWorkflow): { name: string; path: string; method: string }[] {
  return wf.nodes
    .filter((n) => n.type === "n8n-nodes-base.webhook" || n.type === "n8n-nodes-base.webhookTrigger")
    .map((n) => ({
      name: n.name || "Webhook",
      path: n.parameters?.path ?? "",
      method: n.parameters?.httpMethod ?? n.parameters?.method ?? "POST",
    }))
    .filter((w) => w.path);
}

function buildWebhookUrl(baseUrl: string, path: string, test = false): string {
  const base = baseUrl.replace(/\/$/, "");
  const prefix = test ? "webhook-test" : "webhook";
  // path might already be a full URL or just the slug
  if (path.startsWith("http")) return path;
  return `${base}/${prefix}/${path.replace(/^\//, "")}`;
}

// ── WorkflowsPanel ────────────────────────────────────────────────────────────
function WorkflowsPanel({
  baseUrl,
  token,
  onUseWebhook,
}: {
  baseUrl: string;
  token: string;
  onUseWebhook: (url: string, method: "POST" | "GET") => void;
}) {
  const [workflows, setWorkflows]   = useState<N8NWorkflow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [query, setQuery]           = useState("");
  const [filterActive, setFilter]   = useState<"all" | "active" | "inactive">("all");
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [testMode, setTestMode]     = useState(false);
  const abortRef                    = useRef<AbortController | null>(null);

  // Quick fire state per workflow id
  const [quickFiring, setQuickFiring]   = useState<Record<string, boolean>>({});
  const [quickResult, setQuickResult]   = useState<Record<string, "ok" | "err">>({});

  const quickFire = async (wf: N8NWorkflow) => {
    const nodes = extractWebhookNodes(wf);
    if (!nodes.length) return;
    const wn = nodes[0];
    const url = buildWebhookUrl(baseUrl, wn.path, testMode);
    const method = (wn.method.toUpperCase() === "GET" ? "GET" : "POST") as "POST" | "GET";

    setQuickFiring((s) => ({ ...s, [wf.id]: true }));
    setQuickResult((s) => { const n = { ...s }; delete n[wf.id]; return n; });

    try {
      const res = await fetch(url, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : {},
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      setQuickResult((s) => ({ ...s, [wf.id]: res.ok ? "ok" : "err" }));
    } catch {
      setQuickResult((s) => ({ ...s, [wf.id]: "err" }));
    } finally {
      setQuickFiring((s) => ({ ...s, [wf.id]: false }));
      setTimeout(() => setQuickResult((s) => { const n = { ...s }; delete n[wf.id]; return n; }), 2500);
    }
  };

  /**
   * Fetches workflows via the same-origin /api/n8n-proxy backend route.
   * This keeps X-N8N-API-KEY server-side and avoids CORS preflight issues.
   */
  const fetchWorkflows = useCallback(async () => {
    if (!baseUrl || !token) {
      setError("Configure URL base + token para carregar os workflows.");
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    const proxyCall = async (path: string) => {
      const res = await fetch(`${window.location.origin}/api/n8n-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hok-Token": readHokToken(),
        },
        body: JSON.stringify({ baseUrl, token, path }),
        signal: abortRef.current?.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Erro ${res.status}` })) as { error?: string };
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      return res.json() as Promise<{ data?: N8NWorkflow[]; workflows?: N8NWorkflow[] }>;
    };

    try {
      // Try with limit first; some n8n versions don't support active= filter
      const json = await proxyCall("/api/v1/workflows?limit=100");
      const list = json.data ?? json.workflows ?? (Array.isArray(json) ? json as unknown as N8NWorkflow[] : []);
      setWorkflows(list);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Falha ao carregar workflows.");
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token]);

  // Auto-fetch when credentials are available
  useEffect(() => {
    if (baseUrl && token) fetchWorkflows();
    return () => abortRef.current?.abort();
  }, [fetchWorkflows, baseUrl, token]);

  const filtered = workflows.filter((wf) => {
    const matchQuery = wf.name.toLowerCase().includes(query.toLowerCase()) ||
      wf.id.toLowerCase().includes(query.toLowerCase());
    const matchFilter =
      filterActive === "all" ? true :
      filterActive === "active" ? wf.active :
      !wf.active;
    return matchQuery && matchFilter;
  });

  const activeCount   = workflows.filter((w) => w.active).length;
  const inactiveCount = workflows.length - activeCount;

  if (!baseUrl || !token) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Configure URL base e token acima para ver seus workflows.
      </div>
    );
  }

  return (
    <div>
      {/* Header + refresh + stats */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex gap-1.5 flex-wrap">
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
              ● {activeCount} ativos
            </span>
            {inactiveCount > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                ● {inactiveCount} inativos
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setTestMode((v) => !v)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
              testMode
                ? "border-orange-500/40 bg-orange-500/10 text-orange-500"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {testMode ? "🧪 Teste" : "🚀 Prod"}
          </button>
          <button
            onClick={fetchWorkflows}
            disabled={loading}
            className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            aria-label="Atualizar"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar workflow…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <Chip key={f} active={filterActive === f} onClick={() => setFilter(f)}>
              {f === "all" ? "Todos" : f === "active" ? "Ativos" : "Inativos"}
            </Chip>
          ))}
        </div>
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
            <div key={i} className="h-14 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {query ? `Nenhum resultado para "${query}"` : "Nenhum workflow encontrado."}
        </div>
      )}

      {/* Workflow list */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {filtered.map((wf) => {
            const webhookNodes = extractWebhookNodes(wf);
            const isExpanded = expanded === wf.id;
            const hasWebhooks = webhookNodes.length > 0;

            return (
              <motion.div
                key={wf.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "overflow-hidden rounded-2xl border transition-colors",
                  isExpanded
                    ? "border-[color:var(--amber)]/40 bg-[color:var(--amber)]/5"
                    : "border-border bg-card hover:border-[color:var(--amber)]/20",
                )}
              >
                {/* Workflow row */}
                <div className="flex w-full items-center gap-2 px-3 py-3">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : wf.id)}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left"
                  >
                    <Workflow className={cn(
                      "h-4 w-4 shrink-0",
                      wf.active ? "text-emerald-500" : "text-muted-foreground",
                    )} />

                    <div className="flex-1 min-w-0">
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
                      <div className="text-[10px] text-muted-foreground">
                        ID {wf.id}
                        {wf.tags && wf.tags.length > 0 && (
                          <span className="ml-1.5">
                            {wf.tags.map((t) => `#${t.name}`).join(" ")}
                          </span>
                        )}
                        {hasWebhooks && (
                          <span className="ml-1.5 text-[color:var(--amber)]">
                            {webhookNodes.length} webhook{webhookNodes.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isExpanded && "rotate-90",
                    )} />
                  </button>

                  {/* Quick fire button — só para workflows ativos com webhooks */}
                  {wf.active && hasWebhooks && (
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); quickFire(wf); }}
                      disabled={quickFiring[wf.id]}
                      whileTap={{ scale: 0.88 }}
                      className={cn(
                        "shrink-0 flex h-8 w-8 items-center justify-center rounded-xl border transition-all",
                        quickResult[wf.id] === "ok"
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                          : quickResult[wf.id] === "err"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-[color:var(--amber)]/30 bg-[color:var(--amber)]/10 text-[color:var(--amber)] hover:bg-[color:var(--amber)]/20",
                      )}
                      title="Disparar webhook agora"
                    >
                      {quickFiring[wf.id] ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </motion.div>
                      ) : quickResult[wf.id] === "ok" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : quickResult[wf.id] === "err" ? (
                        <AlertCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                    </motion.button>
                  )}
                </div>

                {/* Expanded: webhook nodes */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border/60 px-4 pb-3 pt-2 space-y-2">
                        {!hasWebhooks ? (
                          <p className="text-[11px] text-muted-foreground">
                            Este workflow não tem nó Webhook trigger.
                          </p>
                        ) : (
                          webhookNodes.map((wn, i) => {
                            const prodUrl = buildWebhookUrl(baseUrl, wn.path, false);
                            const url = testMode ? buildWebhookUrl(baseUrl, wn.path, true) : prodUrl;
                            const method = (wn.method.toUpperCase() === "GET" ? "GET" : "POST") as "POST" | "GET";

                            return (
                              <div
                                key={i}
                                className="rounded-xl border border-border bg-background px-3 py-2"
                              >
                                <div className="mb-1 flex items-center gap-2">
                                  <Zap className="h-3 w-3 text-[color:var(--amber)] shrink-0" />
                                  <span className="text-[11px] font-semibold">{wn.name}</span>
                                  <span className={cn(
                                    "rounded-full px-1.5 py-px text-[10px] font-bold ml-auto",
                                    method === "POST"
                                      ? "bg-[color:var(--amber)]/15 text-[color:var(--amber)]"
                                      : "bg-blue-500/15 text-blue-500",
                                  )}>{method}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="flex-1 truncate font-mono text-[10px] text-muted-foreground">
                                    {url}
                                  </span>
                                  <button
                                    onClick={() => onUseWebhook(url, method)}
                                    className="shrink-0 rounded-lg bg-[color:var(--amber)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)] hover:opacity-90"
                                  >
                                    Usar
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
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

export function N8NScreen() {
  // Connection settings
  const [baseUrl, setBaseUrl]                   = useState("");
  const [token, setToken]                       = useState("");
  const [defaultWebhookUrl, setDefaultWebhookUrl] = useState("");
  const [showToken, setShowToken]               = useState(false);
  const [settingsSaved, setSettingsSaved]       = useState(false);

  // "Live" credentials — updated only on save, so panel re-fetches only then
  const [liveBaseUrl, setLiveBaseUrl] = useState("");
  const [liveToken, setLiveToken]     = useState("");

  // Quick fire
  const [method, setMethod]         = useState<"POST" | "GET">("POST");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [body, setBody]             = useState('{\n  \n}');
  const [bodyError, setBodyError]   = useState<string | null>(null);
  const [firing, setFiring]         = useState(false);
  const [fireResult, setFireResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Saved webhooks (user-managed)
  const [webhooks, setWebhooks]         = useState<SavedWebhook[]>([]);
  const [newWHName, setNewWHName]       = useState("");
  const [newWHUrl, setNewWHUrl]         = useState("");
  const [newWHMethod, setNewWHMethod]   = useState<"POST" | "GET">("POST");
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editValue, setEditValue]       = useState("");
  const [addingNew, setAddingNew]       = useState(false);

  // Execution log (session)
  const [execLog, setExecLog] = useState<ExecEntry[]>([]);

  // Active tab
  const [activeTab, setActiveTab] = useState<"workflows" | "webhooks" | "fire">("workflows");

  // Load on mount
  useEffect(() => {
    const s = loadSettings();
    setBaseUrl(s.baseUrl);
    setToken(s.token);
    setDefaultWebhookUrl(s.defaultWebhookUrl);
    if (s.defaultWebhookUrl) setWebhookUrl(s.defaultWebhookUrl);
    setWebhooks(loadWebhooks());
    setLiveBaseUrl(s.baseUrl);
    setLiveToken(s.token);
  }, []);

  const handleSaveSettings = () => {
    persistSettings({ baseUrl, token, defaultWebhookUrl });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 1500);
    // Update live creds so the workflows panel re-fetches
    setLiveBaseUrl(baseUrl);
    setLiveToken(token);
  };

  const validateBody = (value: string) => {
    if (method === "GET") { setBodyError(null); return true; }
    try { JSON.parse(value); setBodyError(null); return true; }
    catch { setBodyError("JSON inválido — verifique a sintaxe."); return false; }
  };

  const fire = async (overrideUrl?: string, overrideMethod?: "POST" | "GET") => {
    const target  = overrideUrl ?? webhookUrl;
    const meth    = overrideMethod ?? method;
    if (!target) { setFireResult({ ok: false, msg: "URL do webhook é obrigatória." }); return; }
    if (meth === "POST" && !validateBody(body)) return;

    setFiring(true);
    setFireResult(null);
    const startTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    try {
      // Webhook trigger endpoints do NOT need auth headers — sending the API key
      // to arbitrary URLs would leak credentials and cause CORS preflight failures.
      const headers: Record<string, string> = {};
      if (meth === "POST") headers["Content-Type"] = "application/json";

      const res = await fetch(target, {
        method: meth,
        headers,
        ...(meth === "POST" ? { body } : {}),
      });

      const text = await res.text().catch(() => "");
      const msg  = res.ok
        ? `✓ Sucesso (${res.status})${text ? `: ${text.slice(0, 120)}` : ""}`
        : `Erro ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`;

      setFireResult({ ok: res.ok, msg });
      setExecLog((prev) => [
        { id: crypto.randomUUID(), status: res.ok ? "ok" : "err", time: startTime, url: target.slice(-50), code: res.status },
        ...prev.slice(0, 19),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao disparar webhook.";
      setFireResult({ ok: false, msg });
      setExecLog((prev) => [
        { id: crypto.randomUUID(), status: "err", time: startTime, url: target.slice(-50), code: 0 },
        ...prev.slice(0, 19),
      ]);
    } finally {
      setFiring(false);
    }
  };

  const handleUseWebhook = (url: string, meth: "POST" | "GET") => {
    setWebhookUrl(url);
    setMethod(meth);
    setActiveTab("fire");
  };

  // Saved webhooks management
  const addWebhook = () => {
    if (!newWHUrl.trim()) return;
    const item: SavedWebhook = {
      id: crypto.randomUUID(),
      name: newWHName.trim() || newWHUrl.trim().split("/").pop() || "webhook",
      url: newWHUrl.trim(),
      method: newWHMethod,
    };
    const next = [...webhooks, item];
    setWebhooks(next); saveWebhooks(next);
    setNewWHName(""); setNewWHUrl(""); setAddingNew(false);
  };

  const removeWebhook = (id: string) => {
    const next = webhooks.filter((w) => w.id !== id);
    setWebhooks(next); saveWebhooks(next);
  };

  const commitRename = (id: string) => {
    const next = webhooks.map((w) => w.id === id ? { ...w, name: editValue.trim() || w.name } : w);
    setWebhooks(next); saveWebhooks(next); setEditingId(null);
  };

  const TABS = [
    { id: "workflows" as const, label: "Workflows", Icon: Workflow },
    { id: "webhooks"  as const, label: "Salvos",    Icon: Zap },
    { id: "fire"      as const, label: "Disparar",  Icon: Send },
  ];

  return (
    <ScreenFrame>
      <ScreenHeader title="N8N Automation" subtitle="Workflows ao vivo, webhooks e disparos." />

      {/* ── Connection settings ── */}
      <Card className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color:var(--amber)]/15 text-[color:var(--amber)]">
            <Cog className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Conexão N8N</div>
            <div className="text-[11px] text-muted-foreground">URL base, token e webhook padrão</div>
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
            placeholder="https://n8n.meuservidor.com"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">API Token (X-N8N-API-KEY)</label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="n8n_api_••••••••"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-9 text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
            />
            <button
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Webhook Padrão (chat)</label>
          <input
            value={defaultWebhookUrl}
            onChange={(e) => setDefaultWebhookUrl(e.target.value)}
            placeholder="https://n8n.meuservidor.com/webhook/..."
            className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
          />
        </div>

        <button
          onClick={handleSaveSettings}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--amber)] py-2.5 text-sm font-semibold text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)] hover:opacity-95 transition-opacity"
        >
          {settingsSaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {settingsSaved ? "Salvo!" : "Salvar Configurações"}
        </button>
      </Card>

      {/* ── Tab navigation ── */}
      <div className="mb-4 flex gap-1 rounded-2xl border border-border bg-card p-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors",
              activeTab === id
                ? "bg-[color:var(--amber)] text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === "fire" && execLog.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/15 text-[9px] font-bold">
                {execLog.length > 9 ? "9+" : execLog.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Workflows (live from API) ── */}
      {activeTab === "workflows" && (
        <WorkflowsPanel
          baseUrl={liveBaseUrl}
          token={liveToken}
          onUseWebhook={handleUseWebhook}
        />
      )}

      {/* ── Tab: Saved webhooks ── */}
      {activeTab === "webhooks" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Webhooks Salvos</span>
            <button
              onClick={() => setAddingNew((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full bg-[color:var(--amber)]/15 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--amber)] hover:bg-[color:var(--amber)]/25"
            >
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          </div>

          {addingNew && (
            <Card className="mb-3 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground">Novo webhook</p>
              <input
                value={newWHName}
                onChange={(e) => setNewWHName(e.target.value)}
                placeholder="Nome (ex: Lead WhatsApp)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--amber)]"
              />
              <input
                value={newWHUrl}
                onChange={(e) => setNewWHUrl(e.target.value)}
                placeholder="https://n8n.meuservidor.com/webhook/..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--amber)]"
              />
              <div className="flex gap-2">
                <div className="flex gap-1">
                  <Chip active={newWHMethod === "POST"} onClick={() => setNewWHMethod("POST")}>POST</Chip>
                  <Chip active={newWHMethod === "GET"}  onClick={() => setNewWHMethod("GET")}>GET</Chip>
                </div>
                <button
                  onClick={addWebhook}
                  disabled={!newWHUrl.trim()}
                  className="ml-auto rounded-xl bg-[color:var(--amber)] px-4 py-2 text-xs font-semibold text-[color:var(--amber-foreground)] hover:opacity-95 disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setAddingNew(false)}
                  className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </Card>
          )}

          {webhooks.length === 0 && !addingNew ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum webhook salvo. Clique "Adicionar" ou use os Workflows para preencher.
            </div>
          ) : (
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div
                  key={w.id}
                  className="group flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-[color:var(--amber)]/30"
                >
                  <div className="flex-1 min-w-0">
                    {editingId === w.id ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(w.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full rounded bg-background px-1 text-sm outline-none ring-1 ring-[color:var(--amber)]"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{w.name}</span>
                        <span className={cn(
                          "shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold",
                          w.method === "POST" ? "bg-[color:var(--amber)]/15 text-[color:var(--amber)]" : "bg-blue-500/15 text-blue-500",
                        )}>{w.method}</span>
                      </div>
                    )}
                    <div className="font-mono text-[10px] text-muted-foreground truncate">{w.url}</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {editingId === w.id ? (
                      <button
                        onMouseDown={(e) => { e.preventDefault(); commitRename(w.id); }}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => { setEditingId(w.id); setEditValue(w.name); }}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleUseWebhook(w.url, w.method)}
                      className="rounded-lg bg-[color:var(--amber)]/15 px-2 py-1 text-[11px] font-semibold text-[color:var(--amber)] hover:bg-[color:var(--amber)]/25"
                    >
                      Usar
                    </button>
                    <button
                      onClick={() => removeWebhook(w.id)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Quick fire ── */}
      {activeTab === "fire" && (
        <div>
          <Card className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Disparo Rápido</div>
              <div className="flex gap-1">
                <Chip active={method === "POST"} onClick={() => setMethod("POST")}>POST</Chip>
                <Chip active={method === "GET"}  onClick={() => setMethod("GET")}>GET</Chip>
              </div>
            </div>

            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://n8n.meuservidor.com/webhook/..."
              className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
            />

            {method === "POST" && (
              <>
                <textarea
                  value={body}
                  onChange={(e) => { setBody(e.target.value); setBodyError(null); }}
                  onBlur={() => validateBody(body)}
                  rows={6}
                  spellCheck={false}
                  className={cn(
                    "mb-1 w-full rounded-xl border bg-[#0d1117] px-3 py-2 font-mono text-[12px] text-emerald-300 outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]",
                    bodyError ? "border-destructive" : "border-zinc-800",
                  )}
                />
                {bodyError && (
                  <div className="mb-2 flex items-center gap-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3" /> {bodyError}
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => fire()}
              disabled={firing || !!bodyError || !webhookUrl}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--amber)] py-3 text-sm font-semibold text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)] hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {firing
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                : <Send className="h-4 w-4" />}
              {firing ? "Disparando…" : "DISPARAR"}
            </button>

            {fireResult && (
              <div className={cn(
                "mt-2 rounded-xl px-3 py-2 text-sm break-all",
                fireResult.ok
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive",
              )}>
                {fireResult.msg}
              </div>
            )}
          </Card>

          {/* Exec log */}
          {execLog.length > 0 && (
            <>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Log de Execuções</div>
              <div className="space-y-2">
                {execLog.map((r) => (
                  <Card key={r.id} className="flex items-center gap-3 p-3">
                    {r.status === "ok"
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      : <AlertCircle  className="h-4 w-4 text-destructive shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[11px] truncate">{r.url}</div>
                      <div className="text-[10px] text-muted-foreground">HTTP {r.code || "—"}</div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" /> {r.time}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </ScreenFrame>
  );
}
