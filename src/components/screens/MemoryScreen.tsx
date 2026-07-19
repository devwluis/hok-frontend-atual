"use client";
import { useState } from "react";
import { ScreenFrame, ScreenHeader, Card, Chip } from "@/components/shell/ScreenFrame";

const ITEMS = [
  { type: "Arquivo", title: "src/routes/api/chat.ts", tag: "stream" },
  { type: "Conceito", title: "Núcleo Eletro-magnético da Hokmá", tag: "core" },
  { type: "Decisão", title: "Adotar AI Gateway próprio", tag: "infra" },
  { type: "Bug", title: "Webhook 400 ao enviar imovel_id null", tag: "n8n" },
  { type: "Conceito", title: "Codex como memória externa", tag: "codex" },
];

const TYPE_COLORS: Record<string, string> = {
  Arquivo: "bg-blue-500/15 text-blue-500",
  Conceito: "bg-purple-500/15 text-purple-500",
  Decisão: "bg-[color:var(--amber)]/15 text-[color:var(--amber)]",
  Bug: "bg-red-500/15 text-red-500",
};

export function MemoryScreen({ embedded = false }: { embedded?: boolean }) {
  const [filter, setFilter] = useState<string>("Todos");
  const types = ["Todos", "Arquivo", "Conceito", "Decisão", "Bug"];
  const list = filter === "Todos" ? ITEMS : ITEMS.filter((i) => i.type === filter);

  const body = (
    <>
      <div className="mb-3 flex flex-wrap gap-1">
        {types.map((t) => (
          <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>{t}</Chip>
        ))}
      </div>
      <div className="space-y-2">
        {list.map((m) => (
          <Card key={m.title} className="p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${TYPE_COLORS[m.type] ?? "bg-muted text-muted-foreground"}`}>
                {m.type}
              </span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">#{m.tag}</span>
            </div>
            <div className="text-sm font-medium">{m.title}</div>
          </Card>
        ))}
      </div>
    </>
  );

  if (embedded) return <div className="px-4 pb-[120px]">{body}</div>;
  return (
    <ScreenFrame>
      <ScreenHeader title="Memory" subtitle="Memória persistente — filtre e revise." />
      {body}
    </ScreenFrame>
  );
}
