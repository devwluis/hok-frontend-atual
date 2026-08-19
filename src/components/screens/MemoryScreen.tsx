"use client";
import { useEffect, useState } from "react";
import { ScreenFrame, ScreenHeader, Card, Chip } from "@/components/shell/ScreenFrame";
import { hokGet } from "@/lib/hok-api";

type MemoryEntry = { key: string; ts: string; value: string };

type MemoryItem = { type: string; title: string; tag: string };

const TYPE_COLORS: Record<string, string> = {
  Arquivo: "bg-blue-500/15 text-blue-500",
  Conceito: "bg-purple-500/15 text-purple-500",
  Decisão: "bg-[color:var(--amber)]/15 text-[color:var(--amber)]",
  Bug: "bg-red-500/15 text-red-500",
};

const TYPES = ["Todos", "Memória", "Arquivo", "Conceito", "Decisão", "Bug"];

function parseKey(key: string): { type: string; tag: string } {
  if (key.startsWith("#")) {
    const [prefix, ...rest] = key.slice(1).split(":");
    const typeMap: Record<string, string> = {
      decisao: "Decisão",
      bug: "Bug",
      arquivo: "Arquivo",
      conceito: "Conceito",
    };
    return { type: typeMap[prefix] ?? "Memória", tag: rest.join(":") || prefix };
  }
  return { type: "Memória", tag: key };
}

export function MemoryScreen({ embedded = false }: { embedded?: boolean }) {
  const [filter, setFilter] = useState<string>("Todos");
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hokGet<{ memories: MemoryEntry[]; status: string }>("/memories").then((res) => {
      if (!active) return;
      if (res.ok) {
        setItems((res.data.memories || []).map((m) => {
          const { type, tag } = parseKey(m.key);
          return { type, tag, title: m.value };
        }));
      } else {
        setError(res.error);
      }
    });
    return () => { active = false; };
  }, []);

  const list = filter === "Todos" ? items : items.filter((i) => i.type === filter);

  const body = (
    <>
      <div className="mb-3 flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>{t}</Chip>
        ))}
      </div>
      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Falha ao carregar as memórias: {error}
        </div>
      )}
      {!error && items.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma memória registrada ainda.</div>
      )}
      {!error && list.length === 0 && filter !== "Todos" && (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma memória do tipo "{filter}".</div>
      )}
      <div className="space-y-2">
        {list.map((m) => (
          <Card key={m.title + m.tag} className="p-3">
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