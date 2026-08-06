"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, MessageCircle, Bot, BotOff, RefreshCw, AlertCircle,
  ChevronRight, X, Send, User,
} from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { OwnerGate } from "@/components/shell/OwnerGate";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = "hokma.settings.v1";
function readSettings(): { serverUrl: string; token: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { serverUrl: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return { serverUrl: s["Server URL"] || "", token: s["HOK_TOKEN"] || "" };
  } catch {
    return { serverUrl: "", token: "" };
  }
}

type LeadStatus =
  | "novo"
  | "contato_feito"
  | "visita_agendada"
  | "proposta"
  | "fechado"
  | "perdido";

type Lead = {
  id: number;
  nome: string;
  telefone: string;
  origem: string;
  campanha?: string;
  status: LeadStatus;
  ia_ativa: boolean;
  criado_em: string;
  atualizado_em: string;
};

type Interaction = {
  id: number;
  lead_id: number;
  canal: string;
  direcao: "entrada" | "saida";
  mensagem: string;
  origem_resposta?: string;
  criado_em: string;
};

const COLUMNS: { id: LeadStatus; label: string; color: string }[] = [
  { id: "novo", label: "Novo", color: "#3b82f6" },
  { id: "contato_feito", label: "Contato feito", color: "#f59e0b" },
  { id: "visita_agendada", label: "Visita agendada", color: "#8b5cf6" },
  { id: "proposta", label: "Proposta", color: "#ec4899" },
  { id: "fechado", label: "Fechado", color: "#22c55e" },
  { id: "perdido", label: "Perdido", color: "#64748b" },
];

export function CRMScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingIA, setTogglingIA] = useState<number | null>(null);

  const { serverUrl, token } = readSettings();

  const fetchLeads = useCallback(async () => {
    if (!serverUrl || !token) {
      setError("Configure Server URL e HOK_TOKEN nas Configurações.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/crm/leads`, {
        headers: { "X-Hok-Token": token },
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : data.leads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar leads.");
    } finally {
      setLoading(false);
    }
  }, [serverUrl, token]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const openLead = async (lead: Lead) => {
    setSelected(lead);
    setInteractions([]);
    setLoadingInteractions(true);
    try {
      const res = await fetch(`${serverUrl}/crm/leads/${lead.id}/interactions`, {
        headers: { "X-Hok-Token": token },
      });
      if (res.ok) {
        const data = await res.json();
        setInteractions(Array.isArray(data) ? data : data.interactions || []);
      }
    } catch {
      // silencioso
    } finally {
      setLoadingInteractions(false);
    }
  };

  const changeStatus = async (lead: Lead, status: LeadStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    try {
      await fetch(`${serverUrl}/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Hok-Token": token },
        body: JSON.stringify({ status }),
      });
    } catch {
      fetchLeads();
    }
  };

  const toggleIA = async (lead: Lead) => {
    setTogglingIA(lead.id);
    const next = !lead.ia_ativa;
    try {
      const res = await fetch(`${serverUrl}/crm/leads/${lead.id}/ia`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Hok-Token": token },
        body: JSON.stringify({ ia_ativa: next }),
      });
      if (res.ok) {
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, ia_ativa: next } : l)));
        if (selected?.id === lead.id) setSelected({ ...selected, ia_ativa: next });
      }
    } finally {
      setTogglingIA(null);
    }
  };

  const sendManualReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${serverUrl}/crm/leads/${selected.id}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hok-Token": token },
        body: JSON.stringify({
          canal: "manual",
          direcao: "saida",
          mensagem: reply.trim(),
          origem_resposta: "humano",
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setInteractions((prev) => [...prev, saved]);
        setReply("");
        setLeads((prev) => prev.map((l) => (l.id === selected.id ? { ...l, ia_ativa: false } : l)));
        setSelected({ ...selected, ia_ativa: false });
      }
    } finally {
      setSending(false);
    }
  };

  const leadsByStatus = (status: LeadStatus) => leads.filter((l) => l.status === status);

  return (
    <OwnerGate label="CRM">
    <ScreenFrame>
      <ScreenHeader title="CRM" subtitle="Leads do imoveischaves.com — Kanban" />

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-[12px]">{error}</span>
          <button onClick={fetchLeads} className="shrink-0 text-[11px] underline">
            Tentar novamente
          </button>
        </div>
      )}

      {loading && leads.length === 0 && !error && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!loading && !error && leads.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum lead ainda.
        </div>
      )}

      <div className="thin-scroll flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const items = leadsByStatus(col.id);
          return (
            <div key={col.id} className="w-[240px] shrink-0">
              <div className="mb-2 flex items-center gap-1.5 px-1">
                <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </span>
                <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((lead) => (
                  <motion.button
                    key={lead.id}
                    layout
                    onClick={() => openLead(lead)}
                    className="w-full rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-[color:var(--amber)]/30"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm font-semibold">{lead.nome}</span>
                      {lead.ia_ativa ? (
                        <Bot className="h-3.5 w-3.5 shrink-0 text-[color:var(--amber)]" />
                      ) : (
                        <BotOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate font-mono">{lead.telefone}</span>
                    </div>
                    {lead.campanha && (
                      <div className="mt-1 truncate text-[10px] text-muted-foreground/70">
                        {lead.origem} · {lead.campanha}
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-3xl border-t border-border bg-background"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold">{selected.nome}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{selected.telefone}</div>
                </div>
                <button
                  onClick={() => toggleIA(selected)}
                  disabled={togglingIA === selected.id}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    selected.ia_ativa
                      ? "border-[color:var(--amber)]/40 bg-[color:var(--amber)]/10 text-[color:var(--amber)]"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {togglingIA === selected.id ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : selected.ia_ativa ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    <BotOff className="h-3 w-3" />
                  )}
                  {selected.ia_ativa ? "IA ativa" : "IA desligada"}
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="shrink-0 flex gap-1.5 overflow-x-auto px-4 py-2 thin-scroll">
                {COLUMNS.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => changeStatus(selected, col.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors",
                      selected.status === col.id
                        ? "border-transparent text-white"
                        : "border-border bg-card text-muted-foreground",
                    )}
                    style={selected.status === col.id ? { background: col.color } : undefined}
                  >
                    {col.label}
                  </button>
                ))}
              </div>

              <div className="thin-scroll flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {loadingInteractions && (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded-xl bg-card" />
                    ))}
                  </div>
                )}
                {!loadingInteractions && interactions.length === 0 && (
                  <p className="py-4 text-center text-[12px] text-muted-foreground">
                    Nenhuma interação registrada ainda.
                  </p>
                )}
                {interactions.map((it) => (
                  <div
                    key={it.id}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-[13px]",
                      it.direcao === "saida"
                        ? "ml-auto bg-[color:var(--amber)]/15 text-foreground"
                        : "bg-card border border-border",
                    )}
                  >
                    <div className="mb-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                      <MessageCircle className="h-2.5 w-2.5" />
                      {it.canal}
                      {it.origem_resposta && ` · ${it.origem_resposta}`}
                    </div>
                    {it.mensagem}
                  </div>
                ))}
              </div>

              <div className="shrink-0 border-t border-border p-3">
                <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendManualReply();
                      }
                    }}
                    placeholder="Responder manualmente…"
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={sendManualReply}
                    disabled={!reply.trim() || sending}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition",
                      reply.trim()
                        ? "bg-[color:var(--amber)] text-[color:var(--amber-foreground)]"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Responder aqui desliga a IA automaticamente para este lead.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </ScreenFrame>
    </OwnerGate>
  );
}
