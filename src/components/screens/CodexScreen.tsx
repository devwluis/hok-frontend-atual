"use client";
import { useEffect, useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { hokGet } from "@/lib/hok-api";

type CodexEntry = { title: string; tag: string; content: string; ts?: string };

type CodexCard = { title: string; tags: string[]; body: string };

export function CodexScreen({ embedded = false }: { embedded?: boolean }) {
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<CodexCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hokGet<{ codex: CodexEntry[]; status: string }>("/codex").then((res) => {
      if (!active) return;
      if (res.ok) {
        setCards((res.data.codex || []).map((c) => ({
          title: c.title,
          tags: c.tag ? [c.tag] : [],
          body: c.content,
        })));
      } else {
        setError(res.error);
      }
    });
    return () => { active = false; };
  }, []);

  const list = cards.filter((c) =>
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
      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Falha ao carregar o Codex: {error}
        </div>
      )}
      {!error && cards.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhum registro no Codex ainda.</div>
      )}
      {list.length === 0 && cards.length > 0 && (
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