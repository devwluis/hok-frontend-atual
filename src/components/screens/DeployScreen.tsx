"use client";
import { useEffect, useState } from "react";
import { Rocket, CheckCircle2, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";
import { hokGet } from "@/lib/hok-api";

type EnvStatus = {
  name: string;
  branch: string;
  commit: string;
  commit_short: string;
  commit_time: string;
  commit_msg: string;
  services: Record<string, string>;
};

type DeployRecord = {
  id: string;
  env: string;
  status: string;
  time: string;
  branch: string;
};

type DeployResponse = {
  status: string;
  env: EnvStatus;
  deploys: DeployRecord[];
  deploys_note?: string;
};

export function DeployScreen() {
  const [data, setData] = useState<DeployResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const res = await hokGet<DeployResponse>("/deploy/status");
    setLoading(false);
    if (res.ok) {
      setData(res.data);
    } else {
      setError(res.error);
    }
  };

  useEffect(() => { refresh(); }, []);

  const env = data?.env;
  const allServicesOk = env?.services ? Object.values(env.services).every((s) => s === "active") : false;

  return (
    <ScreenFrame>
      <ScreenHeader title="Deploy" subtitle="Status de deployments e ambientes." />

      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Falha ao carregar status: {error}
        </div>
      )}

      {data && env && (
        <Card className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 shrink-0">
            <Rocket className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">{env.name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {allServicesOk ? "Online" : "Degradado"} · {env.branch}@{env.commit_short}
            </div>
            {env.commit_msg && (
              <div className="text-[10px] text-muted-foreground/70 truncate">{env.commit_msg}</div>
            )}
          </div>
          <button
            disabled
            title="Novo deploy requer fluxo de aprovacao — pendente (N/A)"
            className="cursor-not-allowed rounded-xl bg-muted px-3 py-1.5 text-xs text-muted-foreground opacity-60"
          >
            Novo deploy
          </button>
        </Card>
      )}

      {loading && !data && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      )}

      {data && !error && data.deploys && data.deploys.length > 0 && (
        <>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Histórico</div>
          <div className="space-y-2">
            {data.deploys.map((d) => (
              <Card key={d.id} className="flex items-center gap-3 p-3">
                {d.status === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{d.env}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{d.branch}</span>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">{d.id}</div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" /> {d.time}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {data && !error && (!data.deploys || data.deploys.length === 0) && data.deploys_note && (
        <div className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
          {data.deploys_note}
        </div>
      )}

      <div className="mt-4 flex justify-center">
        <AmberButton onClick={refresh} className="gap-2 text-sm px-4 py-2 rounded-xl">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </AmberButton>
      </div>
    </ScreenFrame>
  );
}