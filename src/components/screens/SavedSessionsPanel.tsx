"use client";
import { useState } from "react";
import { useTerminal } from "@/hooks/use-terminal";
import { Terminal, Plus, Clock, Monitor, X } from "lucide-react";

export function SavedSessionsPanel({ onClose }: { onClose: () => void }) {
  const termApi = useTerminal();
  const [filter, setFilter] = useState("");

  const sessions = termApi.tabs.map((tab) => ({
    id: tab.id,
    name: tab.note || (tab.id === "ttyd" ? "main" : tab.id),
    conn: tab.conn,
    lastAccess: new Date().toLocaleString("pt-BR"),
  }));

  const filtered = sessions.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#0d1117]/95 backdrop-blur-sm" data-testid="saved-sessions-panel"
      style={{ zIndex: 50 }}>
      <div className="flex items-center justify-between border-b border-emerald-900/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Monitor size={14} className="text-emerald-400" />
          <span className="text-[12px] font-bold text-emerald-200">Sessões Salvas</span>
          <span className="text-[10px] text-emerald-300/40">{sessions.length} sessões</span>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-900/30 text-emerald-300/40 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors">
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="mb-2 px-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar sessões…"
            className="w-full rounded-lg border border-emerald-900/30 bg-[#0d1117] px-3 py-1.5 text-[11px] font-mono text-emerald-200 outline-none placeholder:text-emerald-300/30"
            style={{ borderColor: "var(--hok-line)" }}
            autoFocus
          />
        </div>
        {filtered.map((s) => (
          <div key={s.id} className="flex items-center gap-2.5 rounded-lg border border-emerald-900/20 px-3 py-2 mb-1 hover:bg-emerald-500/5 cursor-pointer transition-colors"
            onClick={() => { termApi.setActiveTab(s.id); onClose(); }}>
            <div className={`h-2 w-2 rounded-full ${s.conn === "live" ? "bg-emerald-400" : s.conn === "connecting" ? "bg-amber-400" : "bg-red-400"}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-mono text-emerald-200 truncate">{s.name}</div>
              <div className="flex items-center gap-1 text-[9px] text-emerald-300/40">
                <Clock size={9} />
                {s.lastAccess}
              </div>
            </div>
            <Terminal size={11} className="text-emerald-300/30" />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[11px] text-emerald-300/30">Nenhuma sessão encontrada</div>
        )}
      </div>
      <div className="border-t border-emerald-900/20 px-4 py-2 flex justify-end">
        <button onClick={() => { termApi.addTab(); onClose(); }}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-900/50 px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 transition-colors">
          <Plus size={11} /> Nova sessão
        </button>
      </div>
    </div>
  );
}
