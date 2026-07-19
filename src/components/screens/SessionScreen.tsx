"use client";
import { useState } from "react";
import { Cpu, RefreshCw, Trash2 } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";
import { conversationsStore } from "@/lib/conversations-store";

export function SessionScreen() {
  const [conversations, setConversations] = useState(() => conversationsStore.list());

  const refresh = () => setConversations(conversationsStore.list());

  const clearAll = () => {
    conversations.forEach((c) => conversationsStore.remove(c.id));
    setConversations([]);
  };

  return (
    <ScreenFrame>
      <ScreenHeader title="Session" subtitle="Gerenciamento de sessões e conversas." />
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-500">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Sessão atual</div>
            <div className="text-[11px] text-muted-foreground">
              {conversations.length} conversa{conversations.length !== 1 ? "s" : ""} salvas
            </div>
          </div>
          <button onClick={refresh} className="rounded-lg p-2 hover:bg-accent" aria-label="Atualizar">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </Card>

      {conversations.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</div>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Card key={c.id} className="flex items-center gap-3 p-3">
              <span className="text-lg">📁</span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {c.messages.length} msg{c.messages.length !== 1 ? "s" : ""} · {new Date(c.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </div>
              </div>
              <button
                onClick={() => { conversationsStore.remove(c.id); refresh(); }}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
