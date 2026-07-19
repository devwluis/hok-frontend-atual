"use client";
import { Rocket, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";

const DEPLOYS = [
  { id: "dep_003", env: "Production", status: "success", time: "há 2h", branch: "main" },
  { id: "dep_002", env: "Staging", status: "success", time: "há 5h", branch: "develop" },
  { id: "dep_001", env: "Production", status: "failed", time: "há 1d", branch: "feat/n8n" },
];

export function DeployScreen() {
  return (
    <ScreenFrame>
      <ScreenHeader title="Deploy" subtitle="Status de deployments e ambientes." />
      <Card className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 shrink-0">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Production</div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Online · main@a3f2c1d
          </div>
        </div>
        <AmberButton className="px-3 py-1.5 text-xs rounded-xl">
          Novo deploy
        </AmberButton>
      </Card>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Histórico</div>
      <div className="space-y-2">
        {DEPLOYS.map((d) => (
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
    </ScreenFrame>
  );
}
