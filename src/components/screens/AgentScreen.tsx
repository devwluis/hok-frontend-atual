"use client";
import { useEffect, useState } from "react";
import { Bot, RefreshCw, Play, Square } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";
import { hokGet } from "@/lib/hok-api";

type Agent = {
  id: string;
  name: string;
  desc: string;
  status: string;
  last_fired: string;
  last_msg: string;
};

function fmtLastFired(ts: string): string {
  if (!ts) return "nunca disparou";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AgentScreen() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const res = await hokGet<{ agents: Agent[]; status: string }>("/agents");
    setLoading(false);
    if (res.ok) {
      setAgents(res.data.agents || []);
    } else {
      setError(res.error);
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <ScreenFrame>
      <ScreenHeader title="Agent" subtitle="Agentes autônomos e automações." />
      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Falha ao carregar os agentes: {error}
        </div>
      )}
      {!error && !loading && agents.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhum agente monitorado.</div>
      )}
      <div className="space-y-3">
        {agents.map((a) => (
          <Card key={a.id} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-500 shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate">{a.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    a.status === "running"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {a.status === "running" ? "rodando" : "parado"}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{a.desc}</div>
              <div className="text-[10px] text-muted-foreground/70">último disparo: {fmtLastFired(a.last_fired)}</div>
            </div>
            <button
              disabled
              title="Pausar/iniciar agente não é suportado pelo backend (pendência)"
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground opacity-60 cursor-not-allowed"
            >
              {a.status === "running" ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          </Card>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        <AmberButton onClick={refresh} className="gap-2 text-sm px-4 py-2 rounded-xl">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar agentes
        </AmberButton>
      </div>
    </ScreenFrame>
  );
}