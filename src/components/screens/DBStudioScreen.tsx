"use client";
import { useState } from "react";
import { Search, Database } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";

const ROWS = [
  { id: "mem_001", tag: "n8n", content: "Webhook imoveis aceita POST com x-hokma-token" },
  { id: "mem_002", tag: "core", content: "Núcleo eletro-magnético renderiza em <16ms" },
  { id: "mem_003", tag: "infra", content: "AI Gateway próprio em /api/chat com SSE" },
  { id: "mem_004", tag: "bug", content: "Trailing comma em JSON quebra parse no n8n" },
  { id: "mem_005", tag: "security", content: "HOK_TOKEN valida requisições ao backend" },
];

export function DBStudioScreen() {
  const [q, setQ] = useState("");
  const filtered = ROWS.filter(
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
          placeholder="SELECT * FROM memory WHERE..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground font-mono"
        />
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            memory — {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">id</th>
              <th className="px-3 py-2">tag</th>
              <th className="px-3 py-2">content</th>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  Nenhum resultado para "{q}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </ScreenFrame>
  );
}
