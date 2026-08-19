"use client";
import { useEffect, useState } from "react";
import { Cpu, RefreshCw, Trash2 } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { hokGet, hokDelete } from "@/lib/hok-api";

type Conversation = {
  id: string;
  title: string;
  project: string;
  model: string;
  created_at: string;
  updated_at: string;
};

function fmtTs(ts: string): string {
  const n = Number(ts);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function SessionScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const res = await hokGet<{ conversations: Conversation[]; status: string }>("/conversations");
    setLoading(false);
    if (res.ok) {
      setConversations(res.data.conversations || []);
    } else {
      setError(res.error);
    }
  };

  const removeOne = async (id: string) => {
    const res = await hokDelete<{ status?: string }>(`/conversations/${id}`);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConversations((c) => c.filter((x) => x.id !== id));
  };

  const clearAll = async () => {
    const ids = [...conversations];
    let failed = 0;
    for (const c of ids) {
      const res = await hokDelete<{ status?: string }>(`/conversations/${c.id}`);
      if (!res.ok) failed++;
    }
    if (failed > 0) {
      setError(`${failed} conversa(s) não puderam ser removidas.`);
      refresh();
    } else {
      setError(null);
      setConversations([]);
    }
  };

  useEffect(() => {
    let active = true;
    hokGet<{ conversations: Conversation[]; status: string }>("/conversations").then((res) => {
      if (!active) return;
      if (res.ok) {
        setConversations(res.data.conversations || []);
      } else {
        setError(res.error);
      }
    });
    return () => { active = false; };
  }, []);

  return (
    <ScreenFrame>
      <ScreenHeader title="Session" subtitle="Gerenciamento de sessões e conversas." />
      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          {error}
        </div>
      )}
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-500">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Sessão atual</div>
            <div className="text-[11px] text-muted-foreground">
              {loading ? "Carregando..." : `${conversations.length} conversa${conversations.length !== 1 ? "s" : ""} no servidor`}
            </div>
          </div>
          <button onClick={refresh} className="rounded-lg p-2 hover:bg-accent" aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </Card>

      {!error && !loading && conversations.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</div>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Card key={c.id} className="flex items-center gap-3 p-3">
              <span className="text-lg">📁</span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {c.project} · atualizada em {fmtTs(c.updated_at)}
                </div>
              </div>
              <button
                onClick={() => removeOne(c.id)}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remover ${c.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {conversations.length > 0 && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
          >
            <Trash2 className="h-4 w-4" /> Limpar todas
          </button>
        </div>
      )}
    </ScreenFrame>
  );
}