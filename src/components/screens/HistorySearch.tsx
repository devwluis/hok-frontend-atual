"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import type { Terminal } from "@xterm/xterm";
import { Search, X, ChevronDown, ChevronUp } from "lucide-react";

export function HistorySearch({
  terminal,
  onClose,
}: {
  terminal: Terminal | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (!query.trim() || !terminal) return [];
    try {
      const buf = terminal.buffer.active;
      const n = buf.length;
      const results: string[] = [];
      for (let y = 0; y < n; y++) {
        const line = buf.getLine(y)?.translateToString(true) ?? "";
        if (line.toLowerCase().includes(query.toLowerCase())) {
          results.push(line);
        }
      }
      return results;
    } catch { return []; }
  }, [query, terminal]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const totalMatches = matches.length;
  const currentMatch = totalMatches > 0 ? matches[currentIdx] : null;

  return (
    <div className="absolute left-4 right-4 z-50" data-testid="history-search" style={{ zIndex: 50 }}>
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg"
        style={{ borderColor: "var(--hok-line)", boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>
        <Search size={13} className="text-emerald-300/50 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCurrentIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter") {
              if (e.shiftKey && totalMatches > 0) {
                setCurrentIdx((currentIdx - 1 + totalMatches) % totalMatches);
              } else if (totalMatches > 0) {
                setCurrentIdx((currentIdx + 1) % totalMatches);
              }
            }
          }}
          placeholder="Buscar no histórico… (Enter = próximo, Shift+Enter = anterior)"
          className="flex-1 bg-transparent text-[12px] font-mono text-emerald-200 outline-none placeholder:text-emerald-300/30"
        />
        {query && (
          <span className="text-[10px] text-emerald-300/40 shrink-0">
            {currentIdx + 1}/{totalMatches}
          </span>
        )}
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-emerald-300/40 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors">
          <X size={12} />
        </button>
      </div>
      {query && totalMatches > 0 && (
        <div className="mt-1 rounded-lg border border-emerald-900/30 bg-[#0d1117]/95 backdrop-blur-sm px-3 py-1.5 text-[10px] text-emerald-300/60">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentIdx((currentIdx - 1 + totalMatches) % totalMatches)} className="hover:text-emerald-300"><ChevronUp size={11} /></button>
            <span>Resultado {currentIdx + 1} de {totalMatches}</span>
            <button onClick={() => setCurrentIdx((currentIdx + 1) % totalMatches)} className="hover:text-emerald-300"><ChevronDown size={11} /></button>
            <span className="ml-auto truncate">{currentMatch?.substring(0, 80)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
