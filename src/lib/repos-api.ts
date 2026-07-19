const SETTINGS_KEY = "hokma.settings.v1";

function readSettings(): { serverUrl: string; token: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { serverUrl: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return { serverUrl: s["Server URL"] || "", token: s["HOK_TOKEN"] || "" };
  } catch {
    return { serverUrl: "", token: "" };
  }
}

export type Repo = {
  id: string;
  kind: "backend" | "frontend";
  name: string;
  remote_url: string;
  branch: string;
  language: string;
  local_path: string;
  stars: number;
  created_at: number;
  updated_at: number;
};

type RawRepo = Record<string, string>;

function normalize(r: RawRepo): Repo {
  return {
    id: r.id,
    kind: (r.kind as Repo["kind"]) || "backend",
    name: r.name || "",
    remote_url: r.remote_url || "",
    branch: r.branch || "main",
    language: r.language || "",
    local_path: r.local_path || "",
    stars: Number(r.stars) || 0,
    created_at: Number(r.created_at) || 0,
    updated_at: Number(r.updated_at) || 0,
  };
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const { serverUrl, token } = readSettings();
  if (!serverUrl) throw new Error("Server URL não configurado nas Configurações");
  const url = serverUrl.replace(/\/$/, "") + path;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers["X-Hok-Token"] = token;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.status) throw new Error(`HTTP ${res.status}`);
  return data;
}

export async function listRepos(kind?: "backend" | "frontend"): Promise<Repo[]> {
  const qs = kind ? `?kind=${kind}` : "";
  const data = await apiFetch(`/repos${qs}`);
  if (data.status !== "ok") throw new Error(data.message || "Erro ao listar repositórios");
  return (data.repositories as RawRepo[]).map(normalize);
}

export async function createRepo(payload: {
  kind: "backend" | "frontend";
  name: string;
  remote_url: string;
  branch: string;
  language: string;
  local_path: string;
  stars: number;
}): Promise<string> {
  const data = await apiFetch("/repos", { method: "POST", body: JSON.stringify(payload) });
  if (data.status !== "ok") throw new Error(data.message || "Erro ao criar repositório");
  return data.id as string;
}

export async function deleteRepo(id: string): Promise<void> {
  const data = await apiFetch(`/repos/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (data.status !== "ok") throw new Error(data.message || "Erro ao excluir repositório");
}

export async function runGitAction(
  id: string,
  action: "status" | "pull" | "push",
): Promise<{ status: string; output?: string; message?: string }> {
  return apiFetch(`/repos/${encodeURIComponent(id)}/git`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}
