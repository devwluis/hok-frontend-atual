"use client";
import { useEffect, useState } from "react";
import { BarChart3, Cpu, Layers, MessageCircle } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { hokGet } from "@/lib/hok-api";

type StatusPayload = {
  battery: number;
  battery_stat: string;
  errors_detected: number;
  errors_fixed: number;
  memories: number;
  ram_used_percent: number;
  skills: number;
  status: string;
  turns: number;
  uptime: string;
  version: string;
  wifi_ip: string;
  wifi_ssid: string;
};

export function MetricsScreen() {
  const [stats, setStats] = useState<{ label: string; value: string; icon: typeof Cpu; color: string; bg: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hokGet<StatusPayload>("/status").then((res) => {
      if (!active) return;
      if (res.ok) {
        const s = res.data;
        setStats([
          { label: "Skills registradas", value: String(s.skills ?? 0), icon: Cpu, color: "text-[color:var(--amber)]", bg: "bg-[color:var(--amber)]/15" },
          { label: "Memórias armazenadas", value: String(s.memories ?? 0), icon: Layers, color: "text-purple-500", bg: "bg-purple-500/15" },
          { label: "Turns (logs)", value: (s.turns ?? 0).toLocaleString("pt-BR"), icon: MessageCircle, color: "text-blue-500", bg: "bg-blue-500/15" },
          { label: "RAM usada", value: `${(s.ram_used_percent ?? 0).toFixed(1)}%`, icon: BarChart3, color: "text-emerald-500", bg: "bg-emerald-500/15" },
        ]);
      } else {
        setError(res.error);
      }
    });
    return () => { active = false; };
  }, []);

  return (
    <ScreenFrame>
      <ScreenHeader title="Metrics" subtitle="Métricas de uso e performance." />
      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Falha ao carregar as métricas: {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {stats.map((s) => (
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
        <div className="py-6 text-center text-sm text-muted-foreground">
          Dados de atividade semanal não disponíveis — o backend ainda não expõe série temporal.
        </div>
      </Card>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pendências do backend</div>
      <Card className="p-4">
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>• Uptime, bateria, Wi-Fi e erros detectados/corrigidos: retornam valores fixos/vazios no backend — exibição honesta aguardando implementação real.</li>
          <li>• Gráfico de atividade semanal: requer endpoint de série temporal (não existe ainda).</li>
        </ul>
      </Card>
    </ScreenFrame>
  );
}