"use client";
import { useEffect, useState } from "react";
import {
  GitBranch, GitCommit, ExternalLink, Plus, Trash2,
  Download, Upload, Loader2, FolderGit2,
} from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, Chip, AmberButton } from "@/components/shell/ScreenFrame";
import { cn } from "@/lib/utils";
import { listRepos, createRepo, deleteRepo, runGitAction, type Repo } from "@/lib/repos-api";

type Kind = "backend" | "frontend";

function formatRelative(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

export function GithubScreen() {
  const [kind, setKind] = useState<Kind>("backend");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", remote_url: "", branch: "main", language: "", local_path: "", stars: "0" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [gitRunning, setGitRunning] = useState<{ id: string; action: string } | null>(null);
  const [gitOutput, setGitOutput] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [error, setError] = useState("");

  const refresh = async (k: Kind = kind) => {
    setLoading(true);
    setError("");
    try {
      setRepos(await listRepos(k));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar repositórios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(kind); /* eslint-disable-next-line */ }, [kind]);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await createRepo({
        kind,
        name: form.name.trim(),
        remote_url: form.remote_url.trim(),
        branch: form.branch.trim() || "main",
        language: form.language.trim(),
        local_path: form.local_path.trim(),
        stars: Number(form.stars) || 0,
      });
      setForm({ name: "", remote_url: "", branch: "main", language: "", local_path: "", stars: "0" });
      setShowForm(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar repositório");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDelete === id) {
      try {
        await deleteRepo(id);
        setConfirmDelete(null);
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir");
      }
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete((c) => (c === id ? null : c)), 2500);
    }
  };

  const handleGit = async (id: string, action: "status" | "pull" | "push") => {
    setGitRunning({ id, action });
    try {
      const res = await runGitAction(id, action);
      setGitOutput((prev) => ({ ...prev, [id]: { ok: res.status === "ok", text: res.output || res.message || "" } }));
      if (res.status === "ok") refresh();
    } catch (e) {
      setGitOutput((prev) => ({ ...prev, [id]: { ok: false, text: e instanceof Error ? e.message : "erro" } }));
    } finally {
      setGitRunning(null);
    }
  };

  return (
    <ScreenFrame>
      <ScreenHeader
        title="GitHub"
        subtitle="Repositórios e ações Git."
        action={
          <button onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-[color:var(--amber)]/50 hover:text-[color:var(--amber)] transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Novo
          </button>
        }
      />

      <div className="mb-4 flex gap-2">
        <Chip active={kind === "backend"} onClick={() => setKind("backend")}>Backend</Chip>
        <Chip active={kind === "frontend"} onClick={() => setKind("frontend")}>Frontend</Chip>
      </div>

      {showForm && (
        <Card className="mb-4 space-y-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Novo repositório · {kind}
          </div>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="owner/repo (ex: devwluis/Hok_atual2)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[color:var(--amber)]/60" />
          <input value={form.remote_url} onChange={(e) => setForm((f) => ({ ...f, remote_url: e.target.value }))}
            placeholder="https://github.com/owner/repo.git"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[color:var(--amber)]/60" />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
              placeholder="branch (main)"
              className="rounded-lg border border-border bg-background px-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[color:var(--amber)]/60" />
            <input value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              placeholder="linguagem (Go, TS...)"
              className="rounded-lg border border-border bg-background px-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[color:var(--amber)]/60" />
          </div>
          <input value={form.local_path} onChange={(e) => setForm((f) => ({ ...f, local_path: e.target.value }))}
            placeholder="path local no servidor (ex: /root/hokma/backend)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] font-mono outline-none focus:ring-1 focus:ring-[color:var(--amber)]/60" />
          <div className="flex items-center gap-2 pt-1">
            <AmberButton onClick={handleCreate} className="flex-1 !py-2 !text-[12px]">Criar repositório</AmberButton>
            <button onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent">
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading && repos.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}

        {!loading && repos.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8">
            <FolderGit2 className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">Nenhum repositório {kind} cadastrado</p>
          </div>
        )}

        {repos.map((repo) => {
          const pendingDelete = confirmDelete === repo.id;
          const out = gitOutput[repo.id];
          const running = gitRunning?.id === repo.id ? gitRunning.action : null;
          return (
            <Card key={repo.id} className="p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-500/15 text-slate-400">
                  <GitBranch className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{repo.name}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{repo.branch}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    {repo.language && <span>{repo.language}</span>}
                    <span>· {repo.stars} ⭐</span>
                    <span>· atualizado {formatRelative(repo.updated_at)}</span>
                  </div>
                  {repo.local_path && (
                    <div className="mt-1.5 truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {repo.local_path}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {repo.remote_url && (
                    <a href={repo.remote_url} target="_blank" rel="noreferrer"
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button onClick={() => handleDelete(repo.id)}
                    className={cn("flex h-6 w-6 items-center justify-center rounded-lg transition-colors",
                      pendingDelete ? "bg-destructive text-white" : "text-muted-foreground hover:bg-destructive/15 hover:text-destructive")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex gap-1.5">
                <button onClick={() => handleGit(repo.id, "status")} disabled={!!running}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-background py-1.5 text-[11px] font-medium text-muted-foreground hover:border-[color:var(--amber)]/50 hover:text-[color:var(--amber)] disabled:opacity-50">
                  {running === "status" ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCommit className="h-3 w-3" />}
                  Status
                </button>
                <button onClick={() => handleGit(repo.id, "pull")} disabled={!!running}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-background py-1.5 text-[11px] font-medium text-muted-foreground hover:border-[color:var(--amber)]/50 hover:text-[color:var(--amber)] disabled:opacity-50">
                  {running === "pull" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Pull
                </button>
                <button onClick={() => handleGit(repo.id, "push")} disabled={!!running}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-background py-1.5 text-[11px] font-medium text-muted-foreground hover:border-[color:var(--amber)]/50 hover:text-[color:var(--amber)] disabled:opacity-50">
                  {running === "push" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  Push
                </button>
              </div>

              {out && (
                <pre className={cn(
                  "mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg px-2 py-1.5 font-mono text-[10px] leading-relaxed",
                  out.ok ? "bg-muted/60 text-foreground/80" : "bg-destructive/10 text-destructive",
                )}>
                  {out.text || "(sem saída)"}
                </pre>
              )}
            </Card>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
