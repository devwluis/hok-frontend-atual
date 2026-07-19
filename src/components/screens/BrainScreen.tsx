"use client";
import { useState } from "react";
import { Brain, BookOpen } from "lucide-react";
import { ScreenFrame, ScreenHeader, Chip } from "@/components/shell/ScreenFrame";
import { MemoryScreen } from "./MemoryScreen";
import { CodexScreen } from "./CodexScreen";

export function BrainScreen() {
  const [tab, setTab] = useState<"memory" | "codex">("memory");

  return (
    <ScreenFrame noPad>
      <div className="px-4 pt-4 pb-3">
        <ScreenHeader title="Memory &amp; Codex" subtitle="Conhecimento persistente da Hokmá." />
        <div className="flex gap-2 rounded-2xl border border-border bg-card p-1">
          {(["memory", "codex"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-[color:var(--amber)] text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "memory" ? <Brain className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              {t === "memory" ? "Memory" : "Codex"}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 mb-3 flex flex-wrap gap-1">
        {tab === "memory" ? (
          <span className="text-xs text-muted-foreground">Filtre por tipo de memória abaixo.</span>
        ) : (
          <span className="text-xs text-muted-foreground">Pesquise pelo conhecimento salvo.</span>
        )}
      </div>
      {tab === "memory" ? <MemoryScreen embedded /> : <CodexScreen embedded />}
    </ScreenFrame>
  );
}
