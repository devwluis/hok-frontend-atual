"use client";
import { useEffect, useState } from "react";
import { Search, Database } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { hokGet } from "@/lib/hok-api";

type MemoryEntry = { key: string; ts: string; value: string };

type Row = { id: string; tag: string; content: string };

function tagOf(key: string): string {
  if (key.startsWith("#")) {
    const prefix = key.slice(1).split(":")[0];
    const map: Record<string, string> = { decisao: "decisao", bug: "bug", arquivo: "arquivo", conceito: "conceito", doc: "doc", erro: "erro" };
    return map[prefix] ?? "memoria";
  }
  return "memoria";
}

export function DBStudioScreen() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hokGet<{ memories: MemoryEntry[]; status: string }>("/memories").then((res) => {
      if (!active) return;
      if (res.ok) {
        setRows((res.data.memories || []).map((m) => ({
          id: m.key,
          tag: tagOf(m.key),
          content: m.value,
        })));
      } else {
        setError(res.error);
      }
    });
    return () => { active = false; };
  }, []);

  const filtered = rows.filter(
    (r) => r.id.includes(q) || r.tag.includes(q) || r.content.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <ScreenFrame>
      <ScreenHeader title="DB Studio" subtitle="Tabela de memórias e registros." />
      <Card className="mb-3 flex items-center gap-2 p-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nas memórias..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground font-mono"
        />
      </Card>
      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Falha ao carregar o banco: {error}
        </div>
      )}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            memories — {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">key</th>
              <th className="px-3 py-2">tag</th>
              <th className="px-3 py-2">value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-accent/50 transition-colors">
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{r.id}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-[color:var(--amber)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--amber)]">
                    {r.tag}
                  </span>
                </td>
                <td className="px-3 py-2 text-[12px]">{r.content}</td>
              </tr>
            ))}
            {rows.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  Nenhum resultado para "{q}"
                </td>
              </tr>
            )}
            {!error && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  Nenhuma memória registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </ScreenFrame>
  );
}