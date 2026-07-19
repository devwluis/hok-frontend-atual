"use client";
import { useState } from "react";
import { Bot, Play, Square, RefreshCw } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";

const AGENTS = [
  { id: "imov", name: "Agente Imóveis", desc: "Monitora cadastros e sync com CRM", status: "idle" },
  { id: "n8n", name: "Agente N8N", desc: "Dispara workflows automáticos", status: "running" },
  { id: "whats", name: "Agente WhatsApp", desc: "Responde leads via webhook", status: "idle" },
];

export function AgentScreen() {
  const [agents, setAgents] = useState(AGENTS);

  const toggle = (id: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: a.status === "running" ? "idle" : "running" } : a,
      ),
    );
  };

  return (
    <ScreenFrame>
      <ScreenHeader title="Agent" subtitle="Agentes autônomos e automações." />
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
            </div>
            <button
              onClick={() => toggle(a.id)}
              className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                a.status === "running"
                  ? "bg-red-500/15 text-red-500 hover:bg-red-500/25"
                  : "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
              }`}
            >
              {a.status === "running" ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          </Card>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        <AmberButton onClick={() => setAgents(AGENTS)} className="gap-2 text-sm px-4 py-2 rounded-xl">
          <RefreshCw className="h-4 w-4" /> Resetar agentes
        </AmberButton>
      </div>
    </ScreenFrame>
  );
}
