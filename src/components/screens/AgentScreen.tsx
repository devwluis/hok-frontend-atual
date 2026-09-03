"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, RefreshCw, Play, Plus, Trash2, Upload, Sparkles, Network, History } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";
import { hokGet, readSettings } from "@/lib/hok-api";

type Agent = {
  id: string;
  name: string;
  desc: string;
  kind: string;
  instructions: string;
  tools: string[];
  model: string;
  knowledge: string;
  active: boolean;
  created_at: string;
};

type AgentRun = {
  id: string;
  agent_name: string;
  task: string;
  reply: string;
  steps: number;
  model: string;
  created_at: string;
};

type RunDetail = {
  run: AgentRun;
  steps: AgentTrace[];
};

type AgentTrace = {
  step: number;
  kind: string;
  agent?: string;
  tool?: string;
  input?: string;
  output?: string;
  ts?: string;
};

type SubagentResult = {
  agent: string;
  output: string;
  error?: string;
  seconds?: number;
};

type OrchestratorResult = {
  task: string;
  reply: string;
  subagents: SubagentResult[];
  steps: number;
  model_used: string;
  tracing: AgentTrace[];
};

type OrchestratorResp = { status: string; result: OrchestratorResult };

async function hokPost<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { serverUrl, token } = readSettings();
  if (!serverUrl) return { ok: false, error: "Server URL não configurado" };
  try {
    const res = await fetch(serverUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Hok-Token": token } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede" };
  }
}

const ALL_TOOLS = [
  "read_file",
  "bash_exec",
  "n8n_list_workflows",
  "n8n_create_workflow",
  "n8n_update_workflow",
  "n8n_activate_workflow",
  "n8n_execute_workflow",
  "n8n_get_execution_errors",
  "n8n_diagnose_workflow",
  "n8n_get_workflow_detail",
  "n8n_expert_lookup",
  "env_diagnose_config",
  "n8n_delete_workflow",
  "n8n_test_workflow",
];

export function AgentScreen() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"orquestrar" | "agentes" | "runs">("orquestrar");
  const [detail, setDetail] = useState<RunDetail | null>(null);

  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OrchestratorResult | null>(null);

  const [form, setForm] = useState({ name: "", desc: "", kind: "subagent", instructions: "", tools: "" as string, model: "" });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const [a, r] = await Promise.all([hokGet<{ agents: Agent[] }>("/agents/crud"), hokGet<{ runs: AgentRun[] }>("/agents/runs")]);
    if (a.ok) setAgents(a.data.agents || []);
    if (r.ok) setRuns(r.data.runs || []);
    if (!a.ok && !r.ok) setError((a.error || r.error || "").toString());
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const loadRunDetail = async (id: string) => {
    const res = await hokGet<RunDetail>(`/agents/runs?run_id=${encodeURIComponent(id)}`);
    if (res.ok) setDetail(res.data);
    else setError(res.error);
  };

  const runOrchestrator = async () => {
    if (!task.trim()) return;
    setRunning(true);
    setError(null);
    const res = await hokPost<OrchestratorResp>("/agents/orchestrate", { task, max_steps: 6 });
    setRunning(false);
    if (res.ok) {
      setResult(res.data.result);
      setTask("");
      refresh();
    } else {
      setError(res.error);
    }
  };

  const saveAgent = async () => {
    if (!form.name.trim()) return;
    const tools = form.tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = {
      name: form.name.trim(),
      desc: form.desc.trim(),
      kind: form.kind,
      instructions: form.instructions,
      tools,
      model: form.model,
    };
    const res = await hokPost<{ agent: Agent }>("/agents/crud", payload);
    if (res.ok) {
      setForm({ name: "", desc: "", kind: "subagent", instructions: "", tools: "", model: "" });
      refresh();
    } else {
      setError(res.error);
    }
  };

  const removeAgent = async (id: string) => {
    const { serverUrl, token } = readSettings();
    if (!serverUrl) return;
    try {
      const res = await fetch(serverUrl.replace(/\/$/, "") + "/agents/crud", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { "X-Hok-Token": token } : {}) },
        body: JSON.stringify({ id }),
      });
      if (res.ok) refresh();
      else setError(`HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de rede");
    }
  };

  const importZip = async (file: File) => {
    setImportMsg(null);
    const { serverUrl, token } = readSettings();
    if (!serverUrl) { setImportMsg("Server URL não configurado"); return; }
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(serverUrl.replace(/\/$/, "") + "/skills/import", {
        method: "POST",
        headers: token ? { "X-Hok-Token": token } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setImportMsg(`HTTP ${res.status}`);
      else setImportMsg(`Importadas ${data.imported ?? 0} skills.`);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Falha no upload");
    }
  };

  const tabs = [
    { id: "orquestrar" as const, label: "Orquestrar", icon: <Network className="h-4 w-4" /> },
    { id: "agentes" as const, label: "Agentes", icon: <Bot className="h-4 w-4" /> },
    { id: "runs" as const, label: "Sessões", icon: <History className="h-4 w-4" /> },
  ];

  return (
    <ScreenFrame>
      <ScreenHeader title="Agentes" subtitle="Orquestrador + subagentes (n8n Agents)." />

      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id ? "border-[color:var(--amber)] bg-[color:var(--amber)]/15 text-[color:var(--amber)]" : "border-border bg-card text-muted-foreground"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">Falha: {error}</div>
      )}

      {tab === "orquestrar" && (
        <div className="space-y-3">
          <Card>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-[color:var(--amber)]" /> Delegar tarefa ao orquestrador
            </div>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
              placeholder="Ex: Liste os workflows do n8n e me diga quais estão ativos."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--amber)]"
            />
            <div className="mt-2">
              <AmberButton onClick={runOrchestrator} disabled={running || !task.trim()} className="text-sm">
                <Play className="h-4 w-4" /> {running ? "Executando…" : "Executar"}
              </AmberButton>
            </div>
          </Card>

          {result && (
            <Card>
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>modelo: <b className="text-foreground">{result.model_used}</b></span>
                <span>·</span>
                <span>passos: <b className="text-foreground">{result.steps}</b></span>
                {result.subagents?.length > 0 && (
                  <>
                    <span>·</span>
                    <span>subagentes: <b className="text-foreground">{result.subagents.map((s) => s.agent).join(", ")}</b></span>
                  </>
                )}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.reply}</div>
              {result.subagents?.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <div className="text-[11px] font-semibold uppercase text-muted-foreground">Resultados dos subagentes</div>
                  {result.subagents.map((s, i) => (
                    <div key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <span className="font-semibold text-[color:var(--amber)]">{s.agent}</span>
                      {typeof s.seconds === "number" && <span className="ml-2 text-muted-foreground">({s.seconds.toFixed(1)}s)</span>}
                      {s.error && <span className="ml-2 text-red-400">erro: {s.error}</span>}
                      <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{s.output}</div>
                    </div>
                  ))}
                </div>
              )}
              {result.tracing?.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">Tracing</div>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {result.tracing.map((t, i) => (
                      <div key={i} className="rounded-md bg-background px-2 py-1.5">
                        <span className="text-muted-foreground">#{t.step}</span>{" "}
                        <span className="text-[color:var(--amber)]">{t.kind}</span>{" "}
                        {t.agent && <span className="text-foreground">{t.agent}</span>}
                        {t.tool && <span className="text-emerald-400">{t.tool}</span>}
                        {t.output && <div className="ml-4 whitespace-pre-wrap text-muted-foreground">{t.output.slice(0, 300)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "agentes" && (
        <div className="space-y-3">
          <Card>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-[color:var(--amber)]" /> Criar agente
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome (ex: Especialista N8N)"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--amber)]"
                />
                <input
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  placeholder="Descrição curta"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--amber)]"
                />
              </div>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--amber)]"
              >
                <option value="subagent">Subagente (especialista)</option>
                <option value="orchestrator">Orquestrador</option>
              </select>
              <textarea
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                rows={2}
                placeholder="Instruções: o papel/escopo deste agente"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--amber)]"
              />
              <input
                value={form.tools}
                onChange={(e) => setForm({ ...form, tools: e.target.value })}
                placeholder="Tools (separadas por vírgula). Vazio = todas. Ex: n8n_list_workflows,n8n_diagnose_workflow"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--amber)]"
              />
              <div className="flex flex-wrap gap-1">
                {ALL_TOOLS.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      const cur = form.tools.split(",").map((x) => x.trim()).filter(Boolean);
                      setForm({
                        ...form,
                        tools: cur.includes(t) ? cur.filter((x) => x !== t).join(",") : [...cur, t].join(","),
                      });
                    }}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
                      form.tools.split(",").map((x) => x.trim()).includes(t)
                        ? "border-[color:var(--amber)] bg-[color:var(--amber)]/15 text-[color:var(--amber)]"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <AmberButton onClick={saveAgent} className="text-sm">Salvar agente</AmberButton>
            </div>
          </Card>

          <Card>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Upload className="h-4 w-4 text-[color:var(--amber)]" /> Importar skills (.zip)
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importZip(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-[color:var(--amber)] hover:text-[color:var(--amber)]"
            >
              Escolher .zip de skills…
            </button>
            {importMsg && <div className="mt-2 text-xs text-[color:var(--emerald)]">{importMsg}</div>}
          </Card>

          {agents.length === 0 && !loading && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum agente criado. Crie um subagente (ex: Especialista N8N) para o orquestrador delegar.
            </div>
          )}
          <div className="space-y-2">
            {agents.map((a) => (
              <Card key={a.id} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-500">
                  {a.kind === "orchestrator" ? <Network className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{a.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${a.active ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      {a.kind}
                    </span>
                  </div>
                  {a.desc && <div className="truncate text-[11px] text-muted-foreground">{a.desc}</div>}
                  {a.tools.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {a.tools.map((t) => (
                        <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeAgent(a.id)}
                  title="Remover agente"
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "runs" && (
        <div className="space-y-2">
          {detail && (
            <Card className="border-[color:var(--amber)]">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">Tracing — {detail.run.agent_name}</div>
                <button
                  onClick={() => setDetail(null)}
                  className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
                >
                  fechar
                </button>
              </div>
              <div className="mb-2 text-xs text-muted-foreground">
                {detail.run.task} · passos: {detail.run.steps} · modelo: {detail.run.model}
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {detail.steps?.map((t, i) => (
                  <div key={i} className="rounded-md bg-background px-2 py-1.5">
                    <span className="text-muted-foreground">#{t.step}</span>{" "}
                    <span className="text-[color:var(--amber)]">{t.kind}</span>{" "}
                    {t.agent && <span className="text-foreground">{t.agent}</span>}
                    {t.tool && <span className="text-emerald-400">{t.tool}</span>}
                    {t.input && <div className="ml-4 text-muted-foreground">in: {t.input.slice(0, 200)}</div>}
                    {t.output && <div className="ml-4 whitespace-pre-wrap text-muted-foreground">{t.output.slice(0, 400)}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}
          {runs.length === 0 && !loading && (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma execução ainda. Rode uma tarefa no orquestrador.</div>
          )}
          {runs.map((r) => (
            <Card key={r.id} className="cursor-pointer transition hover:border-[color:var(--amber)]" >
              <div onClick={() => loadRunDetail(r.id)}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-[color:var(--amber)]">{r.agent_name}</span>
                  <span>·</span>
                  <span>{r.created_at}</span>
                  <span>·</span>
                  <span>passos: {r.steps}</span>
                  <span>·</span>
                  <span>modelo: {r.model}</span>
                </div>
                <div className="mt-1 text-sm font-medium">{r.task}</div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{r.reply.slice(0, 400)}</div>
                <div className="mt-1 text-[10px] text-[color:var(--amber)]">ver tracing →</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-center">
        <AmberButton onClick={refresh} className="gap-2 px-4 py-2 text-sm">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </AmberButton>
      </div>
    </ScreenFrame>
  );
}