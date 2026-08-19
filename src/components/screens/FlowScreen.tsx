"use client";
import { useEffect, useState } from "react";
import { FileCode, Plus, Play, RefreshCw } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";
import { hokGet } from "@/lib/hok-api";

type Flow = {
  name: string;
  steps: number;
  status: string;
};

type FlowsResponse = {
  status: string;
  flows: Flow[];
};

export function FlowScreen() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const res = await hokGet<FlowsResponse>("/flows");
    setLoading(false);
    if (res.ok) {
      setFlows(res.data.flows || []);
    } else {
      setError(res.error);
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <ScreenFrame>
      <ScreenHeader
        title="Flow Builder"
        subtitle="Construtor visual de automações."
        action={
          <button
            disabled
            title="Criar flow requer interface visual — pendente (N/A)"
            className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl bg-muted px-3 py-1.5 text-xs text-muted-foreground opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Novo Flow
          </button>
        }
      />

      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Falha ao carregar flows: {error}
        </div>
      )}

      {!error && !loading && flows.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Nenhum flow disponivel. Flows sao carregados dos workflows do n8n.
        </div>
      )}

      <div className="space-y-3">
        {flows.map((f) => (
          <Card key={f.name} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-500 shrink-0">
              <FileCode className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{f.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  f.status === "active"
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {f.status}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">{f.steps} etapas</div>
            </div>
            <button
              disabled
              title="Executar flow requer confirmacao — pendente (N/A)"
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground opacity-60 cursor-not-allowed"
            >
              <Play className="h-4 w-4" />
            </button>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex justify-center">
        <AmberButton onClick={refresh} className="gap-2 text-sm px-4 py-2 rounded-xl">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar flows
        </AmberButton>
      </div>
    </ScreenFrame>
  );
}