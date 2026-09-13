"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Plus, Pencil, Check, Trash2, User, ChevronRight,
  MessageSquare, Terminal, Workflow, Brain, Settings,
  Bot, FolderOpen, BarChart3, Database, BookOpen, GitBranch,
  Rocket, FileCode, Cpu, FolderPlus, MessagesSquare, Building2,
  Cloud,
} from "lucide-react";
import { useAppState } from "@/hooks/use-app-state";
import { conversationsStore } from "@/lib/conversations-store";
import type { ScreenId } from "@/lib/app-state";
import { cn } from "@/lib/utils";
import logo from "@/assets/hok-logo.png";
import { usePersistentState } from "@/lib/use-persistent-state";

// ── App definitions ────────────────────────────────────────────────────────
type AppDef = {
  id: ScreenId;
  label: string;
  sub: string;
  Icon: typeof MessageSquare;
  from: string;
  to: string;
};

const APPS: AppDef[] = [
  { id: "chat",     label: "Chat",      sub: "IA",        Icon: MessageSquare, from: "#F5A623", to: "#c47b00" },
  { id: "terminal", label: "Terminal",  sub: "Shell",     Icon: Terminal,      from: "#22c55e", to: "#15803d" },
  { id: "n8n",      label: "N8N",       sub: "Flows",     Icon: Workflow,      from: "#e11d48", to: "#9f1239" },
  { id: "agent",    label: "Agente",    sub: "Auto",      Icon: Bot,           from: "#6366f1", to: "#4338ca" },
  { id: "session",  label: "Session",   sub: "Vars",      Icon: Cpu,           from: "#8b5cf6", to: "#6d28d9" },
  { id: "memory",   label: "Memória",   sub: "RAG",       Icon: Brain,         from: "#ec4899", to: "#be185d" },
  { id: "deploy",   label: "Deploy",    sub: "CI/CD",     Icon: Rocket,        from: "#f97316", to: "#c2410c" },
  { id: "github",   label: "GitHub",    sub: "Git",       Icon: GitBranch,     from: "#94a3b8", to: "#475569" },
  { id: "dbstudio", label: "DB",        sub: "Studio",    Icon: Database,      from: "#06b6d4", to: "#0e7490" },
  { id: "metrics",  label: "Métricas",  sub: "Stats",     Icon: BarChart3,     from: "#a78bfa", to: "#7c3aed" },
  { id: "files",    label: "Arquivos",  sub: "FS",        Icon: FolderOpen,    from: "#fbbf24", to: "#d97706" },
  { id: "codex",    label: "Codex",     sub: "Docs",      Icon: BookOpen,      from: "#ef4444", to: "#b91c1c" },
  { id: "flow",     label: "Flow",      sub: "Visual",    Icon: FileCode,      from: "#14b8a6", to: "#0f766e" },
  { id: "crm",     label: "CRM",       sub: "Leads",     Icon: Building2,    from: "#f5a623", to: "#c47b00" },
  { id: "drive",    label: "Drive",     sub: "Cloud",     Icon: Cloud,         from: "#4285f4", to: "#1a73e8" },
  { id: "settings", label: "Config",    sub: "Setup",     Icon: Settings,      from: "#64748b", to: "#334155" },
];

// ── Tipos projeto ──────────────────────────────────────────────────────────
type Project = { id: string; name: string; createdAt: number };

// ── Componente ─────────────────────────────────────────────────────────────
export function Drawer() {
  const { drawerOpen, toggleDrawer, setScreen, conversationId, setConversationId } = useAppState();

  const [conversations, setConversations] = usePersistentState<{ id: string; title: string; updatedAt: number }[]>(
    "hokma.conversations.v1", [],
  );
  const [projects, setProjects] = usePersistentState<Project[]>("hokma.projects.v1", []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [showProjectInput, setShowProjectInput] = useState(false);

  const refresh = () => {
    setConversations(conversationsStore.list().map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })));
  };

  const navigate = (id: ScreenId) => { setScreen(id); toggleDrawer(false); };

  const newConversation = () => {
    const c = conversationsStore.create("Nova conversa");
    setConversationId(c.id);
    setScreen("chat");
    toggleDrawer(false);
  };

  const openConversation = (id: string) => {
    setConversationId(id);
    setScreen("chat");
    toggleDrawer(false);
  };

  const removeConversation = async (id: string) => {
    if (confirmDelete === id) {
      if (conversationId === id) setConversationId(null);
      setConfirmDelete(null);
      await conversationsStore.remove(id);
      refresh();
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 2500);
    }
  };

  const startEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditValue(title);
  };

  const commitEdit = (id: string) => {
    if (editValue.trim()) conversationsStore.rename(id, editValue.trim());
    setEditingId(null);
    refresh();
  };

  const createProject = () => {
    const name = newProjectName.trim() || "Novo Projeto";
    const proj: Project = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    setProjects((prev) => [...prev, proj]);
    setNewProjectName("");
    setShowProjectInput(false);
  };

  const removeProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const sorted = conversationsStore.list();

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            onClick={() => toggleDrawer(false)}
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="absolute inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-hidden bg-card"
            style={{ borderRight: "1px solid var(--border)" }}
          >

            {/* ── Header ── */}
            <div className="flex h-14 shrink-0 items-center justify-between px-4"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2.5">
                <img src={logo} alt="HOK" className="h-8 w-8 rounded-xl object-contain"
                  style={{ filter: "drop-shadow(0 0 4px rgba(245,166,35,0.4))" }} />
                <div className="leading-none">
                  <div className="text-[13px] font-bold tracking-wide text-[color:var(--amber)]">H.O.K.</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Navigator</div>
                </div>
              </div>
              <button onClick={() => toggleDrawer(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="thin-scroll flex-1 overflow-y-auto">

              {/* ── App Grid ── */}
              <div className="px-3 pt-4 pb-3">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Ferramentas</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {APPS.map(({ id, label, sub, Icon, from, to }) => (
                    <motion.button
                      key={id}
                      onClick={() => navigate(id)}
                      whileTap={{ scale: 0.9 }}
                      className="group flex flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-colors hover:bg-accent"
                    >
                      {/* Icon badge */}
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm"
                        style={{
                          background: `linear-gradient(135deg, ${from}, ${to})`,
                          boxShadow: `0 2px 8px ${from}40`,
                        }}
                      >
                        <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />
                      </span>
                      {/* Labels */}
                      <div className="text-center leading-none">
                        <div className="text-[10px] font-semibold text-foreground leading-tight">{label}</div>
                        <div className="text-[8px] text-muted-foreground font-mono mt-0.5">{sub}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* ── Projetos ── */}
              <div className="px-3 pb-3"
                style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="h-px w-4 bg-border" />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Projetos</span>
                  </div>
                  <button
                    onClick={() => setShowProjectInput((v) => !v)}
                    className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:border-[color:var(--amber)]/50 hover:text-[color:var(--amber)] transition-colors"
                  >
                    <FolderPlus className="h-3 w-3" />
                    Criar
                  </button>
                </div>

                <AnimatePresence>
                  {showProjectInput && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mb-2"
                    >
                      <div className="flex gap-1.5 rounded-xl border border-[color:var(--amber)]/30 bg-background p-1.5">
                        <input
                          autoFocus
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") createProject(); if (e.key === "Escape") setShowProjectInput(false); }}
                          placeholder="Nome do projeto…"
                          className="flex-1 bg-transparent text-[12px] outline-none text-foreground placeholder:text-muted-foreground px-1"
                        />
                        <button onClick={createProject}
                          className="flex h-6 w-6 items-center justify-center rounded-lg bg-[color:var(--amber)] text-[color:var(--amber-foreground)]">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {projects.length === 0 && !showProjectInput && (
                  <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">
                    Nenhum projeto criado
                  </p>
                )}
                <ul className="space-y-1">
                  {projects.map((p) => (
                    <li key={p.id}
                      className="group flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 hover:border-border hover:bg-accent transition-all">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[color:var(--amber)]" />
                      <span className="flex-1 truncate text-[12px] font-medium">{p.name}</span>
                      <button onClick={() => removeProject(p.id)}
                        className="flex h-5 w-5 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-all">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── Conversas ── */}
              <div className="px-3 pb-24"
                style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="h-px w-4 bg-border" />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Histórico</span>
                  </div>
                  <button
                    onClick={newConversation}
                    className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:border-[color:var(--amber)]/50 hover:text-[color:var(--amber)] transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Nova
                  </button>
                </div>

                {sorted.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <MessagesSquare className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-[11px] text-muted-foreground">Nenhuma conversa ainda</p>
                  </div>
                )}

                <ul className="space-y-0.5">
                  {sorted.map((c) => {
                    const active = c.id === conversationId;
                    const editing = editingId === c.id;
                    const pendingDelete = confirmDelete === c.id;

                    return (
                      <motion.li
                        key={c.id}
                        layout
                        className={cn(
                          "flex items-center gap-2 rounded-xl px-2.5 py-2 transition-all",
                          active
                            ? "bg-[color:var(--amber)]/10 border border-[color:var(--amber)]/20"
                            : "border border-transparent hover:bg-accent hover:border-border",
                        )}
                      >
                        {/* Icon */}
                        <div className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-[color:var(--amber)]/20" : "bg-muted"
                        )}>
                          <MessageSquare className={cn("h-3.5 w-3.5",
                            active ? "text-[color:var(--amber)]" : "text-muted-foreground")} />
                        </div>

                        {/* Title or input */}
                        {editing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(c.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            onBlur={() => commitEdit(c.id)}
                            className="flex-1 rounded-lg bg-background px-2 py-0.5 text-[12px] outline-none ring-1 ring-[color:var(--amber)]/60 text-foreground"
                          />
                        ) : (
                          <button
                            onClick={() => openConversation(c.id)}
                            className="flex-1 truncate text-left text-[12px] font-medium text-foreground/90"
                          >
                            {c.title}
                          </button>
                        )}

                        {/* Always-visible action buttons */}
                        <div className="flex shrink-0 items-center gap-0.5">
                          {editing ? (
                            <button
                              onMouseDown={(e) => { e.preventDefault(); commitEdit(c.id); }}
                              className="flex h-6 w-6 items-center justify-center rounded-lg bg-[color:var(--amber)]/15 text-[color:var(--amber)] hover:bg-[color:var(--amber)]/25 transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(c.id, c.title)}
                                title="Renomear"
                                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => removeConversation(c.id)}
                                title={pendingDelete ? "Confirmar exclusão" : "Excluir"}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-lg transition-colors",
                                  pendingDelete
                                    ? "bg-destructive text-white"
                                    : "text-muted-foreground hover:bg-destructive/15 hover:text-destructive",
                                )}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* ── Footer (fixed) ── */}
            <div className="shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--amber)] text-[color:var(--amber-foreground)] font-bold text-sm shadow-sm">
                  W
                </div>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="text-[13px] font-semibold truncate">Washington</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Architect · Dev</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </div>
            </div>

          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
