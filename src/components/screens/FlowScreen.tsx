"use client";
import { FileCode, Plus, Play } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";

const FLOWS = [
  { name: "Lead → WhatsApp → CRM", steps: 3, status: "active" },
  { name: "Imóvel → N8N → Supabase", steps: 4, status: "draft" },
  { name: "Erro → Alert → Slack", steps: 2, status: "active" },
];

export function FlowScreen() {
  return (
    <ScreenFrame>
      <ScreenHeader
        title="Flow Builder"
        subtitle="Construtor visual de automações."
        action={
          <AmberButton className="px-3 py-1.5 text-xs rounded-xl gap-1">
            <Plus className="h-3.5 w-3.5" /> Novo Flow
          </AmberButton>
        }
      />
      <div className="space-y-3">
        {FLOWS.map((f) => (
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
            <button className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25">
              <Play className="h-4 w-4" />
            </button>
          </Card>
        ))}
      </div>
    </ScreenFrame>
  );
}
