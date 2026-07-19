"use client";
import { BarChart3, TrendingUp, Zap, MessageCircle } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";

const STATS = [
  { label: "Mensagens hoje", value: "47", icon: MessageCircle, color: "text-[color:var(--amber)]", bg: "bg-[color:var(--amber)]/15" },
  { label: "Webhooks disparados", value: "12", icon: Zap, color: "text-purple-500", bg: "bg-purple-500/15" },
  { label: "Uptime servidor", value: "99.8%", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/15" },
  { label: "Tokens usados", value: "84k", icon: BarChart3, color: "text-blue-500", bg: "bg-blue-500/15" },
];

export function MetricsScreen() {
  return (
    <ScreenFrame>
      <ScreenHeader title="Metrics" subtitle="Métricas de uso e performance." />
      <div className="grid grid-cols-2 gap-3 mb-4">
        {STATS.map((s) => (
          <Card key={s.label} className="p-3">
            <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl ${s.bg} ${s.color}`}>
              <s.icon className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Atividade Semanal</div>
      <Card className="p-4">
        <div className="flex items-end gap-1 h-20">
          {[40, 65, 30, 80, 55, 90, 47].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-[color:var(--amber)]/70"
                style={{ height: `${h}%` }}
              />
              <span className="text-[9px] text-muted-foreground">
                {["S", "T", "Q", "Q", "S", "S", "D"][i]}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </ScreenFrame>
  );
}
