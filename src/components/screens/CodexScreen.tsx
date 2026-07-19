"use client";
import { useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";

const CARDS = [
  { title: "Padrão de Webhook N8N", tags: ["n8n", "rest"], body: "Sempre validar Content-Type e usar JSON.stringify no nó Code." },
  { title: "Prompt sênior Hokmá", tags: ["prompt"], body: "Foco em precisão técnica, sem comentários genéricos." },
  { title: "Núcleo Eletro-magnético", tags: ["ui", "core"], body: "Esfera amber pulsante com anel cíclico." },
  { title: "Autenticação X-Hok-Token", tags: ["segurança", "api"], body: "Todas as chamadas ao HOK backend usam X-Hok-Token no header." },
  { title: "Chave de configurações unificada", tags: ["frontend", "settings"], body: "Usar hokma.settings.v1 em toda a aplicação para consistência." },
];

export function CodexScreen({ embedded = false }: { embedded?: boolean }) {
  const [q, setQ] = useState("");
  const list = CARDS.filter((c) =>
    c.title.toLowerCase().includes(q.toLowerCase()) ||
    c.body.toLowerCase().includes(q.toLowerCase()) ||
    c.tags.some((t) => t.toLowerCase().includes(q.toLowerCase())),
  );

  const body = (
    <>
      <Card className="mb-3 flex items-center gap-2 p-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar no Codex..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </Card>
      {list.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhum resultado para "{q}"</div>
      )}
      <div className="space-y-2">
        {list.map((c) => (
          <Card key={c.title} className="p-3">
            <div className="mb-1 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[color:var(--amber)]" />
              <span className="text-sm font-semibold">{c.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{c.body}</p>
            <div className="mt-2 flex gap-1">
              {c.tags.map((t) => (
                <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  #{t}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );

  if (embedded) return <div className="px-4 pb-[120px]">{body}</div>;
  return (
    <ScreenFrame>
      <ScreenHeader title="Codex" subtitle="Biblioteca de conhecimento sênior." />
      {body}
    </ScreenFrame>
  );
}
