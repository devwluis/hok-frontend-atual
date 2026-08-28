"use client";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Bug, Send, Copy, Webhook, ChevronDown, ChevronUp, X, Image as ImageIcon, Paperclip, Mic, FileAudio, Sparkles, Brain, Plus } from "lucide-react";
import { SiN8N } from "react-icons/si";
import { ElectricCore } from "@/components/chat/ElectricCore";
import { NuclearCore } from "@/components/chat/NuclearCore";
import ModeSelector from "@/components/chat/ModeSelector";
import { cn } from "@/lib/utils";
import { conversationsStore, type ChatMessage } from "@/lib/conversations-store";
import { useAppState } from "@/hooks/use-app-state";
import { getModel, getFreeModels, getPaidModels, getZenModels, invalidateModelsCache, FALLBACK_MODELS, type HokModel } from "@/lib/hok-models";
import { type PendingAction } from "@/lib/chat-stream";
import { detectN8NIntent, N8N_SYSTEM_PROMPT, type N8NModeState } from "@/lib/n8n-expert";
import { OwnerGate } from "@/components/shell/OwnerGate";

// Unified settings key
const SETTINGS_KEY = "hokma.settings.v1";
const N8N_SETTINGS_KEY = "hokma.n8n.settings.v1";
const CHAT_STATE_KEY = "hokma.chat.state.v1";
const ENGINE_KEY = "hokma.engine.v1";
const MODEL_SELECT_KEY = "hokma.model.selected.v1";

type ModelSelection = { engine: EngineId; modelId: string; updatedAt: string };

// Persistência unificada da seleção de IA/modelo (PROBLEMA 1 — sessão).
// Chave dedicada "hokma.model.selected.v1"; a chave antiga "hokma.engine.v1"
// serve de fallback/migração quando a nova ainda não existe.
function readModelSelection(): ModelSelection | null {
  try {
    const raw = localStorage.getItem(MODEL_SELECT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ModelSelection>;
    if (typeof p.modelId !== "string") return null;
    return {
      engine: ENGINE_OPTIONS.some((o) => o.id === p.engine) ? (p.engine as EngineId) : "hok",
      modelId: p.modelId,
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : "",
    };
  } catch { /* ignore */ }
  return null;
}
function writeModelSelection(engine: EngineId, modelId: string) {
  try {
    localStorage.setItem(MODEL_SELECT_KEY, JSON.stringify({ engine, modelId, updatedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

// FIX 16/08 (UX): engine forçado persiste entre sessões via localStorage —
// reler ao montar, salvar a cada troca. IDs v5: auto | hok | claude | opencode | hermes.
type EngineId = "auto" | "hok" | "claude" | "opencode" | "hermes";
// PARTE 2 (25/08): "Automático" removido do menu — era idêntico ao Hok Orquestrador
// (mesma ausência de force flags no request; ver smart_chat.go classifyEngine).
// "Hok Orquestrador" renomeado para "Hok OS" e promovido a único caminho padrão.
// O id interno "auto" permanece na união só para migrar valores antigos do localStorage.
const ENGINE_OPTIONS: { id: EngineId; label: string; sub?: string; Icon?: (p: { className?: string }) => React.ReactNode }[] = [
  { id: "hok", label: "Hok OS", sub: "padrão" },
  { id: "claude", label: "Claude Code" },
  { id: "opencode", label: "OpenCode Terminal" },
  { id: "hermes", label: "Hermes" },
];
// Estilo de marca de cada engine (guia branding Hok OS, CSS em index.css)
const ENGINE_BRAND: Record<EngineId, string> = {
  auto: "",
  hok: "engine-brand-hok",
  claude: "engine-brand-claude",
  opencode: "engine-brand-opencode",
  hermes: "engine-brand-hermes",
};
function readForcedEngine(): EngineId {
  try {
    const v = localStorage.getItem(ENGINE_KEY) as EngineId | "claude_code";
    if (v === "claude_code") return "claude";
    // migração: "auto" foi removido do menu — mesmo caminho do Hok OS
    if (v === "auto") return "hok";
    if (ENGINE_OPTIONS.some((o) => o.id === v)) return v;
  } catch { /* ignore */ }
  return "hok";
}
function writeForcedEngine(v: EngineId) {
  try { localStorage.setItem(ENGINE_KEY, v); } catch { /* ignore */ }
}

type ChatState = {
  conversationId: string | null;
  drafts: Record<string, string>;
  scrolls: Record<string, number>;
};

function readChatState(): ChatState {
  try {
    const raw = localStorage.getItem(CHAT_STATE_KEY);
    if (!raw) return { conversationId: null, drafts: {}, scrolls: {} };
    const s = JSON.parse(raw) as Partial<ChatState>;
    return {
      conversationId: s.conversationId ?? null,
      drafts: s.drafts ?? {},
      scrolls: s.scrolls ?? {},
    };
  } catch {
    return { conversationId: null, drafts: {}, scrolls: {} };
  }
}

function writeChatState(patch: Partial<ChatState>) {
  try {
    localStorage.setItem(CHAT_STATE_KEY, JSON.stringify({ ...readChatState(), ...patch }));
  } catch {
    /* ignora quota/erros */
  }
}

type Msg = ChatMessage & {
  meta?: { ms: number; model?: string };
  imagePreview?: string;
  audioName?: string;
  pendingAction?: PendingAction | null;
};

type Attachment = {
  id: string;
  type: "image" | "file" | "audio";
  name: string;
  size: number;
  dataUrl?: string;   // para preview de imagem
  textContent?: string; // conteúdo de texto (arquivos de código/texto)
};

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { serverUrl: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return { serverUrl: s["Server URL"] || "", token: s["HOK_TOKEN"] || "" };
  } catch {
    return { serverUrl: "", token: "" };
  }
}

function readN8NWebhook(): { webhookUrl: string; token: string } {
  try {
    const raw = localStorage.getItem(N8N_SETTINGS_KEY);
    if (!raw) return { webhookUrl: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return {
      webhookUrl: s["defaultWebhookUrl"] || s["url"] || "",
      token: s["token"] || "",
    };
  } catch {
    return { webhookUrl: "", token: "" };
  }
}

type CodeFence = { lang: string; code: string };

// Separa o texto entre fences ```lang ... ``` — blocos viram CodeBlock, resto vira texto puro
function splitCodeFences(text: string): { text: string; fences: CodeFence[] } {
  const fences: CodeFence[] = [];
  const parts: string[] = [];
  const re = /```([\w+#.-]*)\s*\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    parts.push(text.slice(last, m.index));
    fences.push({ lang: m[1] || "code", code: m[2] });
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return { text: parts.join(""), fences };
}

// ── Code block (fences ```lang) inside assistant bubble ───────────────────────
function CodeBlock({ lang, code, onSendToWebhook }: { lang: string; code: string; onSendToWebhook?: (j: string) => void }) {
  const [copied, setCopied] = useState(false);
  const isJson = lang.toLowerCase() === "json";
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800 bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{lang}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-800/80 px-2 py-1 text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
          >
            <Copy className="h-3 w-3" /> {copied ? "Copiado" : "Copiar"}
          </button>
          {isJson && onSendToWebhook && (
            <button
              onClick={() => onSendToWebhook(code)}
              className="inline-flex items-center gap-1 rounded-md bg-[color:var(--amber)]/90 px-2 py-1 text-[10px] font-semibold text-[color:var(--amber-foreground)] hover:opacity-90"
            >
              <Webhook className="h-3 w-3" /> Webhook
            </button>
          )}
        </div>
      </div>
      <pre className={`thin-scroll max-h-72 overflow-auto px-3 py-2 font-mono text-[12px] leading-relaxed ${isJson ? "text-emerald-300" : "text-zinc-200"}`}>
        {code}
      </pre>
    </div>
  );
}

// ── Texto longo colapsável (blocos de código ficam fora, intactos) ───────────
const COLLAPSE_THRESHOLD = 700;

// Inline markdown leve: `codigo`, **negrito**, *itálico*
function renderInline(raw: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const segs = raw.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  segs.forEach((s, i) => {
    if (!s) return;
    if (s.startsWith("`") && s.endsWith("`")) {
      parts.push(<code key={i} className="inline-code">{s.slice(1, -1)}</code>);
    } else if (s.startsWith("**") && s.endsWith("**") && s.length > 4) {
      parts.push(<strong key={i}>{s.slice(2, -2)}</strong>);
    } else if (s.startsWith("*") && s.endsWith("*") && s.length > 2) {
      parts.push(<em key={i}>{s.slice(1, -1)}</em>);
    } else {
      parts.push(<React.Fragment key={i}>{s}</React.Fragment>);
    }
  });
  return <>{parts}</>;
}

// Markdown leve das respostas do Hok: títulos esmeralda, subtítulos âmbar,
// listas com marcador esmeralda, citações com barra âmbar (paleta UX 16/08).
function MarkdownView({ text }: { text: string }) {
  const inlineMd = renderInline;
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: React.ReactNode[] = [];
  const flushList = (s: string) => {
    if (listType && listItems.length) {
      const items = listItems.map((it, i) => React.createElement("li", { key: i }, it));
      if (listType === "ul") {
        out.push(<ul key={`l-${s}`}>{items}</ul>);
      } else {
        out.push(<ol key={`l-${s}`}>{items}</ol>);
      }
      listItems = [];
    }
    listType = null;
  };
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (!t) { flushList(String(idx)); return; }
    const m2 = t.match(/^(#{1,2})\s+(.*)$/);
    const m3 = t.match(/^(#{3})\s+(.*)$/);
    const m4 = t.match(/^(#{4,6})\s+(.*)$/);
    if (m2) { flushList(String(idx)); out.push(<h2 key={idx}>{inlineMd(m2[2])}</h2>); return; }
    if (m3) { flushList(String(idx)); out.push(<h3 key={idx}>{inlineMd(m3[2])}</h3>); return; }
    if (m4) { flushList(String(idx)); out.push(<h4 key={idx}>{inlineMd(m4[2])}</h4>); return; }
    if (/^(---|\*\*\*|___)\s*$/.test(t)) { flushList(String(idx)); out.push(<hr key={idx} />); return; }
    const ul = t.match(/^[-*•]\s+(.*)$/);
    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    if (ul) { if (listType !== "ul") { flushList("u" + idx); listType = "ul"; } listItems.push(inlineMd(ul[1])); return; }
    if (ol) { if (listType !== "ol") { flushList("o" + idx); listType = "ol"; } listItems.push(inlineMd(ol[1])); return; }
    if (t.startsWith("> ")) { flushList(String(idx)); out.push(<blockquote key={idx}>{inlineMd(t.slice(2))}</blockquote>); return; }
    flushList(String(idx));
    out.push(<p key={idx}>{inlineMd(t)}</p>);
  });
  flushList("end");
  return <div className="markdown-body">{out}</div>;
}

function CollapsibleBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > COLLAPSE_THRESHOLD;
  return (
    <div>
      <div className={`whitespace-pre-wrap ${long && !open ? "line-clamp-8" : ""}`}>
        <MarkdownView text={text} />
      </div>
      {long && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[color:var(--amber)] hover:opacity-80"
        >
          {open ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Ver menos
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Ver mais
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── Single message bubble ─────────────────────────────────────────────────────
function MessageBubble({
  msg,
  onSendToWebhook,
  onApprovePending,
  onRejectPending,
}: {
  msg: Msg;
  onSendToWebhook?: (j: string) => void;
  onApprovePending?: () => void;
  onRejectPending?: () => void;
}) {
  const isUser = msg.role === "user";
  const { text: bodyText, fences } = !isUser ? splitCodeFences(msg.text) : { text: msg.text, fences: [] };
  const modelInfo = !isUser && msg.meta?.model ? getModel(msg.meta.model) : null;
  const [copiedBody, setCopiedBody] = useState(false);
  const copyBody = () => {
    navigator.clipboard.writeText(bodyText + (fences.length ? "\n\n" + fences.map((f) => "```" + f.lang + "\n" + f.code + "\n```").join("\n\n") : ""));
    setCopiedBody(true);
    setTimeout(() => setCopiedBody(false), 1200);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("group/msg flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "relative max-w-[85%] px-4 py-3 text-[15px] leading-relaxed shadow-sm",
          isUser
            ? "rounded-[20px] rounded-br-md bg-[color:var(--emerald)] text-[color:var(--emerald-foreground)]"
            : "rounded-[20px] rounded-bl-md border border-border bg-card text-card-foreground",
        )}
      >
        {!isUser && (bodyText || fences.length > 0) && (
          <button
            onClick={copyBody}
            className="copy-float-btn absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-[color:var(--secondary)] px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-[color:var(--accent)]"
            title="Copiar resposta"
          >
            <Copy className="h-3 w-3" /> {copiedBody ? "Copiado" : "Copiar"}
          </button>
        )}
        {msg.imagePreview && (
          <img
            src={msg.imagePreview}
            alt="Imagem anexada"
            className="mb-2 max-h-64 rounded-lg border border-border/40 object-contain"
          />
        )}
        {msg.audioName && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/40 bg-black/5 px-3 py-2 text-xs">
            🎵 {msg.audioName}
          </div>
        )}
        {bodyText && <CollapsibleBody text={bodyText} />}
        {fences.map((f, i) => (
          <CodeBlock key={i} lang={f.lang} code={f.code} onSendToWebhook={onSendToWebhook} />
        ))}
        {!isUser && msg.pendingAction && (
          <div className="mt-2 border-t border-border/60 pt-2">
            {msg.pendingAction.action_type === "self_mod" && msg.pendingAction.diff_preview && (
              <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                  <span>⚠️</span>
                  <span>Autmodificação — Revise o diff antes de aprovar</span>
                </div>
                <pre className="max-h-48 overflow-auto rounded bg-black/60 p-2 text-[10px] font-mono leading-tight text-amber-100/90 whitespace-pre-wrap">
                  {msg.pendingAction.diff_preview}
                </pre>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={onApprovePending} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25">Aprovar</button>
              <button onClick={onRejectPending} className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/25">Rejeitar</button>
            </div>
          </div>
        )}


        {!isUser && msg.meta && (
          <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-1.5">
            {modelInfo && (
              <span className="flex items-center gap-1 text-[10px] font-mono font-medium" style={{ color: modelInfo.color }}>
                {modelInfo.label}
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {(msg.meta.ms / 1000).toFixed(1)}s
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Catálogo de IA (UX v5): busca + agrupado por provedor + tag FREE ──────────
function ModelCatalogList({ modelsList, search, activeModelId, onSelect }: {
  modelsList: { paid: HokModel[]; free: HokModel[]; zen: HokModel[] };
  search: string;
  activeModelId: string;
  onSelect: (id: string) => void;
}) {
  const q = search.trim().toLowerCase();
  const match = (m: HokModel) =>
    !q ||
    m.label.toLowerCase().includes(q) ||
    m.id.toLowerCase().includes(q) ||
    m.provider.toLowerCase().includes(q) ||
    (Array.isArray(m.tags) && m.tags.some((t) => t.includes(q)));
  const groups: { header: string; badge?: string; badgeCls?: string; models: HokModel[] }[] = [];
  const paid = modelsList.paid.filter(match);
  if (paid.length) groups.push({ header: "PAGO", badge: "PAGO", badgeCls: "bg-[color:var(--amber)]/15 text-[color:var(--amber)]", models: paid });
  const freeByProvider = new Map<string, HokModel[]>();
  for (const m of modelsList.free) {
    if (!match(m)) continue;
    const arr = freeByProvider.get(m.provider) ?? [];
    arr.push(m);
    freeByProvider.set(m.provider, arr);
  }
  for (const [provider, models] of freeByProvider) {
    groups.push({ header: provider, badge: "FREE", badgeCls: "bg-[color:var(--emerald)]/15 text-[color:var(--emerald)]", models });
  }
  const zen = modelsList.zen.filter(match);
  if (zen.length) groups.push({ header: "OpenCode Zen", badge: "ZEN", badgeCls: "bg-[#a78bfa]/15 text-[#a78bfa]", models: zen });
  if (groups.length === 0) {
    return <div className="px-3 py-2 text-[10px] font-mono text-muted-foreground">Nenhum modelo encontrado.</div>;
  }
  return (
    <>
      {groups.map((g) => (
        <div key={g.header}>
          <div className="flex items-center gap-1 px-3 py-1 text-[9px] font-bold tracking-widest text-muted-foreground">
            {g.header}
            {g.badge && <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-bold", g.badgeCls)}>{g.badge}</span>}
          </div>
          {g.models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[11px] font-mono transition-colors hover:bg-muted",
                activeModelId === m.id ? "text-[color:var(--cyan-glow)]" : "text-foreground",
              )}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.color }} />
              <span className="truncate">{m.label}</span>
              {m.free && (
                <span className="ml-auto rounded-full bg-[color:var(--emerald)]/15 px-1.5 py-0.5 text-[8px] font-bold text-[color:var(--emerald)]">FREE</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
// PONTE CHAT→TTYD (24/08): sessão ttyd ativa por último no terminal —
// vai no request para o backend injetar na sessão CERTA (imune a corridas
// de registro entre instâncias/abas do app).
function activeTerminalSession(): string | undefined {
  try {
    const raw = localStorage.getItem("hokma.terminal.tabs.v1");
    if (!raw) return undefined;
    const t = JSON.parse(raw);
    const active = t?.active;
    if (!active) return undefined;
    return active === "ttyd" ? "hok-ttyd" : "hok-terminal-" + active;
  } catch {
    return undefined;
  }
}

export function ChatScreen() {
  const { conversationId, setConversationId } = useAppState();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(() => readModelSelection()?.modelId ?? "auto");
  const [n8nMode, setN8nMode] = useState<N8NModeState>("off");
  const [forcedEngine, setForcedEngine] = useState<EngineId>(() => readModelSelection()?.engine ?? readForcedEngine());
  const [resolvedEngine, setResolvedEngine] = useState<"claude_code" | "hermes" | "opencode" | "opencode_serve" | "chat" | null>(null);
  const [showEnginePicker, setShowEnginePicker] = useState(false);
  const [showModelsPicker, setShowModelsPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [modelMenuError, setModelMenuError] = useState<string | null>(null);
  const [modelMenuRetry, setModelMenuRetry] = useState(0);
  const [modelsList, setModelsList] = useState<{ paid: HokModel[]; free: HokModel[]; zen: HokModel[] } | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [activeModelId, setActiveModelId] = useState<string>("auto");
  const [modelToast, setModelToast] = useState<string | null>(null);
  const lastToastModelRef = useRef<string | null>(null);

  useEffect(() => {
    if (showModelsPicker && !modelsList) {
      setModelMenuError(null);
      Promise.all([getPaidModels(true), getFreeModels(true), getZenModels(true)])
        .then(([paid, free, zen]) => {
          setModelsList({ paid, free, zen });
        })
        .catch(() => {
          setModelMenuError("Não foi possível carregar o catálogo de modelos.");
          const paid = FALLBACK_MODELS.filter((x) => !x.free && x.provider !== "OpenCode Zen");
          const free = FALLBACK_MODELS.filter((x) => x.free);
          const zen = FALLBACK_MODELS.filter((x) => x.provider === "OpenCode Zen");
          setModelsList({ paid, free, zen });
        });
    }
  }, [showModelsPicker, modelsList, modelMenuRetry]);

  // Auto-refresh do catálogo enquanto aberto: novos modelos do OpenCode
  // aparecem automaticamente sem precisar fechar/reabrir.
  useEffect(() => {
    if (!showModelsPicker) return;
    const t = setInterval(() => {
      setModelMenuError(null);
      Promise.all([getPaidModels(true), getFreeModels(true), getZenModels(true)])
        .then(([paid, free, zen]) => setModelsList({ paid, free, zen }))
        .catch(() => { /* mantém a lista atual */ });
    }, 60_000);
    return () => clearInterval(t);
  }, [showModelsPicker]);

  const selectModel = (modelId: string) => {
    // Atualiza estado e fecha o catálogo imediatamente (label do botão
    // compacto muda na hora); o POST /models/select roda em background.
    setSelectedModel(modelId);
    setActiveModelId(modelId);
    setShowModelsPicker(false);
    try {
      const { serverUrl, token } = readSettings();
      if (!serverUrl || !token) return;
      fetch(`${serverUrl}/models/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hok-Token": token },
        body: JSON.stringify({ model: modelId }),
      })
        .then(() => invalidateModelsCache())
        .catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const skipNextReloadRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const n8nActive = n8nMode !== "off";

  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipAutoScrollRef = useRef(false);
  const restoredStateRef = useRef(false);
  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const accRef = useRef<string>("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // ── Lê arquivo e adiciona ao estado ──
  const addFile = (file: File, kind: Attachment["type"]) => {
    const id = crypto.randomUUID();
    const base: Attachment = { id, type: kind, name: file.name, size: file.size };
    const reader = new FileReader();
    if (kind === "image" || kind === "audio") {
      reader.onload = () => setAttachments((a) => [...a, { ...base, dataUrl: reader.result as string }]);
      reader.readAsDataURL(file);
    } else if (kind === "file" && file.size < 200_000 && /\.(txt|md|json|ts|tsx|js|jsx|py|sh|yaml|yml|env|csv|html|css|xml|toml|sql)$/i.test(file.name)) {
      reader.onload = () => setAttachments((a) => [...a, { ...base, textContent: reader.result as string }]);
      reader.readAsText(file);
    } else {
      setAttachments((a) => [...a, base]);
    }
  };

  // ── Gravação de áudio ao vivo (estilo ChatGPT/Claude) ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || "audio/webm" });
        const ext = (mr.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `gravacao-${Date.now()}.${ext}`, { type: blob.type });
        addFile(file, "audio");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch (err) {
      setError("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };
  const handlePhotoChange  = (e: React.ChangeEvent<HTMLInputElement>) => { [...(e.target.files ?? [])].forEach((f) => addFile(f, "image")); e.target.value = ""; };
  const handleFileChange   = (e: React.ChangeEvent<HTMLInputElement>) => { [...(e.target.files ?? [])].forEach((f) => addFile(f, "file"));  e.target.value = ""; };
  const handleAudioChange  = (e: React.ChangeEvent<HTMLInputElement>) => { [...(e.target.files ?? [])].forEach((f) => addFile(f, "audio")); e.target.value = ""; };

  const removeAttachment = (id: string) => setAttachments((a) => a.filter((x) => x.id !== id));

  // Formata anexos como contexto de texto para o prompt
  const buildAttachmentContext = (atts: Attachment[]): string => {
    if (!atts.length) return "";
    return atts.map((a) => {
      if (a.type === "image") return `[Imagem anexada: ${a.name}]`;
      if (a.type === "audio") return `[Áudio anexado: ${a.name}]`;
      if (a.textContent) return `[Arquivo: ${a.name}]\n\`\`\`\n${a.textContent.slice(0, 8000)}\n\`\`\``;
      return `[Arquivo anexado: ${a.name} (${(a.size / 1024).toFixed(1)} KB)]`;
    }).join("\n\n");
  };

  const activeModel = getModel(selectedModel);
  const engineLabel = ENGINE_OPTIONS.find((o) => o.id === forcedEngine)?.label ?? "Hok OS";

  // Nome do engine para o card "processando" do efeito Núcleo — cobre os
  // engines que o resolvedEngine reconhece (Hermes, Claude Code, OpenCode —
  // serve e CLI — e o chat padrão "Hok OS"); null mantém o rótulo genérico.
  const processingEngineName: string | null = (() => {
    if (forcedEngine === "hermes") return "Hermes";
    if (forcedEngine === "claude") return "Claude Code";
    if (forcedEngine === "opencode") return "OpenCode";
    if (forcedEngine === "hok") return "Hok OS";
    if (forcedEngine !== "auto") return null;
    if (resolvedEngine === "hermes") return "Hermes";
    if (resolvedEngine === "claude_code") return "Claude Code";
    if (resolvedEngine === "opencode" || resolvedEngine === "opencode_serve") return "OpenCode";
    if (resolvedEngine === "chat") return "Hok OS";
    // auto com engine ainda não resolvido (o engine_used chega só com a
    // resposta) → o padrão do modo automático é o Hok OS.
    return "Hok OS";
  })();

  // Load messages when conversation changes
  useEffect(() => {
    if (skipNextReloadRef.current) { skipNextReloadRef.current = false; return; }
    if (!conversationId) { setMessages([]); return; }
    const conv = conversationsStore.get(conversationId);
    setMessages(conv ? (conv.messages as Msg[]) : []);
  }, [conversationId]);

  // FASE MAIOR (27/08): retomada de job em background — ao voltar para a aba
  // (ou reabrir o app), verifica se há job ativo para a conversa: running →
  // retoma o polling (bolha "processando"); done → traz a resposta que foi
  // produzida enquanto a aba estava fechada.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const { serverUrl, token } = readSettings();
    // Mesma lógica do envio: sem "Server URL" configurado (app no próprio
    // domínio, proxy nginx), usa window.location.origin — a retomada funciona
    // nos dois cenários.
    const baseUrl = serverUrl || window.location.origin;
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Hok-Token": token };
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/chat/job?conv_id=${encodeURIComponent(conversationId)}`, {
          headers,
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { jobs?: { job_id?: string; status?: string; reply?: string; engine?: string; model_used?: string; pending_action?: PendingAction | null }[] };
        const latest = data.jobs?.[0];
        if (!latest || !latest.job_id || cancelled) return;
        if (latest.status === "running") {
          // retoma o polling com a bolha de processamento
          setLoading(true);
          const assistantId = crypto.randomUUID();
          for (;;) {
            if (cancelled || abortRef.current?.signal.aborted) return;
            await new Promise((r) => setTimeout(r, 2000));
            const jr = await fetch(`${baseUrl}/chat/job?id=${encodeURIComponent(latest.job_id)}`, {
              headers,
            });
            if (!jr.ok) continue;
            const job = (await jr.json()) as { status?: string; reply?: string; pending_action?: PendingAction | null };
            if (job.status === "done") {
              if (cancelled) return;
              if (job.pending_action) {
                pendingActionRef.current = job.pending_action;
                setPendingAction(job.pending_action);
              }
              const text = job.reply ?? "";
              setMessages((prev) => {
                if (prev.some((m) => m.text === text)) return prev;
                const next = [...prev, { id: assistantId, role: "assistant" as const, text: text || "…" }];
                persist(next, conversationId);
                return next;
              });
              setLoading(false);
              return;
            }
          }
        } else if (latest.status === "done" && latest.reply) {
          if (latest.pending_action) {
            pendingActionRef.current = latest.pending_action;
            setPendingAction(latest.pending_action);
          }
          const doneText = latest.reply ?? "";
          setMessages((prev) => {
            if (prev.some((m) => m.text === doneText)) return prev;
            const next = [...prev, { id: crypto.randomUUID(), role: "assistant" as const, text: doneText }];
            persist(next, conversationId);
            return next;
          });
        }
      } catch { /* job expirado/falha de rede: silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [conversationId]);

  // ── Persistência de estado (conversa ativa, rascunho e scroll por conversa) ──
  useEffect(() => {
    if (restoredStateRef.current) return;
    restoredStateRef.current = true;
    const saved = readChatState();
    if (saved.conversationId && !conversationId && conversationsStore.get(saved.conversationId)) {
      setConversationId(saved.conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restaura rascunho/scroll quando a conversa fica ativa
  useEffect(() => {
    if (!conversationId || !restoredStateRef.current) return;
    const saved = readChatState();
    if (saved.drafts[conversationId]) setInput(saved.drafts[conversationId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Persiste engine forçado + modelo selecionado (localStorage) — sobrevivem
  // ao fechar/reabrir o app. Gravação imediata (sem debounce): troca de
  // modelo/engine é evento raro e deve persistir na hora.
  useEffect(() => {
    writeForcedEngine(forcedEngine);
    writeModelSelection(forcedEngine, selectedModel);
  }, [forcedEngine, selectedModel]);

  useEffect(() => {
    if (conversationId) writeChatState({ conversationId });
  }, [conversationId]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (conversationId) {
        const s = readChatState();
        writeChatState({ drafts: { ...s.drafts, [conversationId]: input } });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [input, conversationId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !conversationId) return;
    const ratio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    const s = readChatState();
    writeChatState({ scrolls: { ...s.scrolls, [conversationId]: ratio } });
  };

  // Restaura a posição de scroll da conversa após as mensagens carregarem
  useEffect(() => {
    if (!conversationId) return;
    const saved = readChatState();
    const ratio = saved.scrolls[conversationId];
    const el = scrollRef.current;
    if (el && ratio !== undefined && ratio > 0 && ratio < 1) {
      el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
      skipAutoScrollRef.current = true;
    }
  }, [messages, conversationId]);

  useEffect(() => {
    if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return; }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  const persist = (next: Msg[], idOverride?: string) => {
    const id = idOverride ?? conversationId;
    if (!id) return;
    const stripped: ChatMessage[] = next.map(({ id: mid, role, text }) => ({ id: mid, role, text }));
    const existing = conversationsStore.get(id);
    const title = existing?.title && existing.title !== "Nova conversa"
      ? existing.title
      : (stripped.find((m) => m.role === "user")?.text.slice(0, 40) ?? "Nova conversa");
    conversationsStore.upsert({ id, title, updatedAt: Date.now(), messages: stripped });
  };

  const handleSendToWebhook = async (json: string) => {
    const { webhookUrl, token } = readN8NWebhook();
    if (!webhookUrl) {
      setWebhookResult("Configure o Webhook URL nas configurações do N8N primeiro.");
      setTimeout(() => setWebhookResult(null), 3000);
      return;
    }
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["X-N8N-API-KEY"] = token;
      const res = await fetch(webhookUrl, { method: "POST", headers, body: json });
      setWebhookResult(res.ok ? `✓ Enviado! (${res.status})` : `Erro ${res.status}`);
    } catch {
      setWebhookResult("Falha ao enviar para o webhook.");
    }
    setTimeout(() => setWebhookResult(null), 3000);
  };

  const resolvePending = async (approve: boolean) => {
    const { serverUrl, token } = readSettings();
    const baseUrl = serverUrl || window.location.origin;
    const path = approve ? "/actions/approve" : "/actions/reject";
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["X-Hok-Token"] = token;
      if (conversationId) headers["X-Conversation-Id"] = conversationId;
      const res = await fetch(baseUrl.replace(/\/$/, "") + path, { method: "POST", headers });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; status?: string };
      if (!res.ok || data.status === "unauthorized") {
        setError(`Falha ao processar a ação pendente (HTTP ${res.status}${data.status ? `: ${data.status}` : ""}).`);
        return;
      }
      const replyMsg: Msg = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.reply || (approve ? "Ação aprovada." : "Ação rejeitada."),
      };
      setMessages((prev) => {
        const cleared = prev.map((m) => (m.pendingAction ? { ...m, pendingAction: null } : m));
        const next = [...cleared, replyMsg];
        persist(next);
        return next;
      });
    } catch {
      setError("Falha ao processar a ação pendente (erro de rede).");
    } finally {
      setPendingAction(null);
    }
  };

  const send = async () => {
    const t = input.trim();
    // FIX 16/08 (double-send): loadingRef e SINCRONO — o state `loading`
    // so atualiza apos re-render, entao dois submits no mesmo tick
    // (Enter+clique, double-tap) passavam o guard antigo e enviavam a
    // mesma mensagem 2-3x. Watchdog de 3min libera o lock se o stream
    // nunca retornar.
    if ((!t && attachments.length === 0) || loadingRef.current || loading) return;
    loadingRef.current = true;
    setError(null);
    let id = conversationId;
    if (!id) {
      const c = conversationsStore.create((t || attachments[0]?.name || "Anexo").slice(0, 40));
      id = c.id;
      skipNextReloadRef.current = true;
      setConversationId(id);
    }

    // Constrói texto completo com contexto de anexos
    const attCtx = buildAttachmentContext(attachments);
    const fullText = [attCtx, t].filter(Boolean).join("\n\n");
    // Extrai a imagem (base64 puro, sem o prefixo data:) para envio real ao backend
    const imageAtt = attachments.find((a) => a.type === "image" && a.dataUrl);
    const imageB64 = imageAtt?.dataUrl?.split(",")[1];
    const imageMime = imageAtt?.dataUrl?.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
    const audioAtt = attachments.find((a) => a.type === "audio" && a.dataUrl);
    const audioB64 = audioAtt?.dataUrl?.split(",")[1];
    const audioMime = audioAtt?.dataUrl?.match(/^data:([^;]+);base64,/)?.[1] || "audio/webm";

    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      text: fullText,
      imagePreview: imageAtt?.dataUrl,
      audioName: audioAtt?.name,
    };
    const afterUser = [...messages, userMsg];
    setMessages(afterUser);
    persist(afterUser, id);
    setInput("");
    setAttachments([]);
    setLoading(true);
    accRef.current = "";
    pendingActionRef.current = null;

    // ── N8N intent auto-detection ──
    if (n8nMode === "off" && detectN8NIntent(t)) {
      setN8nMode("auto");
    }
    const isN8N = n8nMode !== "off" || detectN8NIntent(t);

    const { serverUrl, token } = readSettings();

    if (serverUrl && !token) {
      setError("Configure o HOK_TOKEN nas Configurações para usar o servidor externo.");
      setLoading(false);
      return;
    }

    const baseUrl = serverUrl || window.location.origin;
    // /chat/smart SEMPRE (com ou sem Server URL): o nginx do próprio domínio
    // já proxyia /chat/* para o backend. O antigo /api/chat (handleRoot) é
    // síncrono e não tem o fluxo async/jobs — era o motivo da retomada não
    // funcionar sem Server URL configurado.
    const endpointPath = "/chat/smart";
    const assistantId = crypto.randomUUID();
    const startedAt = performance.now();

    abortRef.current = new AbortController();
    setResolvedEngine(null);

    // Build messages — inject N8N system prompt at the top when active
    const outMessages: { role: "user" | "assistant" | "system"; content: string }[] = [
      ...(isN8N ? [{ role: "system" as const, content: N8N_SYSTEM_PROMPT }] : []),
      ...afterUser.map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
    ];

    try {
      // FASE MAIOR (27/08): envio ASYNC — o backend cria um job em background
      // que sobrevive à desconexão da aba/app; este fluxo faz polling em
      // GET /chat/job até o job terminar. A bolha "processando" é dirigida
      // pelo status do job (o antigo sendWatchdog de 180s foi removido).
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-Hok-Token": token };
      if (id) headers["X-Conversation-Id"] = id;

      const lastUserMessage = [...outMessages].reverse().find((m) => m.role === "user")?.content ?? "";
      const bodyObj: Record<string, unknown> = {
        message: lastUserMessage,
        messages: outMessages,
        history: outMessages,
        model: selectedModel,
        webSearch: !!webSearch,
        forceClaudeCode: forcedEngine === "claude",
        forceHermes: forcedEngine === "hermes",
        forceOpenCode: forcedEngine === "opencode",
        ...(imageB64 ? { image_b64: imageB64, image_mime: imageMime || "image/jpeg" } : {}),
        ...(audioB64 ? { audio_b64: audioB64, audio_mime: audioMime || "audio/webm" } : {}),
        async: true,
      };
      const res = await fetch(`${baseUrl}${endpointPath}`, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyObj),
        signal: abortRef.current?.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const start = (await res.json()) as { job_id?: string; reply?: string; mode?: string; pendingAction?: PendingAction | null };

      const applyResult = (replyText: string, engine?: string, modelUsed?: string, pending?: PendingAction | null) => {
        if (pending) {
          pendingActionRef.current = pending;
          setPendingAction(pending);
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pendingAction: pending } : m)));
        }
        if (engine === "hermes" || engine === "claude_code" || engine === "opencode" || engine === "opencode_serve" || engine === "chat") setResolvedEngine(engine);
        if (modelUsed && modelUsed !== "auto") setActiveModelId(modelUsed);
        if (replyText) {
          accRef.current = replyText;
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === assistantId);
            return exists ? prev.map((m) => (m.id === assistantId ? { ...m, text: replyText } : m)) : [...prev, { id: assistantId, role: "assistant" as const, text: replyText }];
          });
        }
      };

      if (start.job_id) {
        for (;;) {
          if (abortRef.current?.signal.aborted) throw new DOMException("aborted", "AbortError");
          await new Promise((r) => setTimeout(r, 2000));
          const jr = await fetch(`${baseUrl}/chat/job?id=${encodeURIComponent(start.job_id)}`, {
            headers,
            signal: abortRef.current?.signal,
          });
          if (!jr.ok) continue;
          const job = (await jr.json()) as { status?: string; reply?: string; mode?: string; engine?: string; model_used?: string; pending_action?: PendingAction | null };
          if (job.status === "done") {
            applyResult(job.reply ?? "", job.engine, job.model_used, job.pending_action ?? null);
            break;
          }
        }
      } else {
        applyResult(start.reply ?? "", undefined, undefined, start.pendingAction ?? null);
      }

      const ms = performance.now() - startedAt;
      const final: Msg = {
        id: assistantId,
        role: "assistant",
        text: accRef.current || "…",
        meta: { ms, model: selectedModel },
        pendingAction: pendingActionRef.current,
      };
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === assistantId);
        return exists ? prev.map((m) => (m.id === assistantId ? final : m)) : [...prev, final];
      });
      persist([...afterUser, final], id);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // intentional stop
      } else {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
        if (!accRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const { serverUrl } = readSettings();

  return (
    <OwnerGate label="Chat">
    <div className="flex h-full flex-col bg-background">
      {/* ── Messages ── */}
      <div ref={scrollRef} onScroll={handleScroll} className="thin-scroll flex-1 overflow-y-auto px-4 pt-4 pb-28">
        {messages.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center">
            <NuclearCore />
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onSendToWebhook={handleSendToWebhook}
              onApprovePending={() => resolvePending(true)}
              onRejectPending={() => resolvePending(false)}
            />
          ))}

          {/* Thinking animation with electric core */}
          {loading && accRef.current === "" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="rounded-[20px] rounded-bl-md border border-border bg-card px-4">
                <ElectricCore
                  label={processingEngineName ? <><b>{processingEngineName}</b> processando…</> : "Processando requisição…"}
                  modelName={activeModel.id !== "auto" ? activeModel.label : undefined}
                  engine={forcedEngine !== "auto" ? (forcedEngine === "hok" ? "auto" : forcedEngine === "claude" ? "claude_code" : forcedEngine) : (resolvedEngine === "chat" ? "auto" : resolvedEngine === "opencode_serve" ? "opencode" : resolvedEngine ?? "auto")}
                />
              </div>
            </motion.div>
          )}
        </div>
        <div ref={endRef} />
      </div>

      {/* ── Model swap toast ── */}
      <AnimatePresence>
        {modelToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-[color:var(--cyan-glow)]/30 bg-[color:var(--cyan-glow)]/10 px-4 py-2 text-[11px] font-mono text-[color:var(--cyan-glow)]"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{modelToast}</span>
            <button onClick={() => setModelToast(null)} className="shrink-0 text-xs opacity-60 hover:opacity-100">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Webhook result ── */}
      {webhookResult && (
        <div className="mx-4 mb-2 rounded-xl border border-[color:var(--amber)]/30 bg-[color:var(--amber)]/10 px-4 py-2 text-sm text-[color:var(--amber)]">
          {webhookResult}
        </div>
      )}

      {/* ── N8N Expert Mode banner ── */}
      <AnimatePresence>
        {n8nActive && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mx-4 mb-2 flex items-center gap-2 rounded-xl border px-3 py-2"
            style={{
              borderColor: "rgba(225,29,72,0.35)",
              background: "rgba(225,29,72,0.07)",
            }}
          >
            <SiN8N className="h-3.5 w-3.5 shrink-0 text-rose-500" />
            <span className="flex-1 text-[11px] font-medium text-rose-500">
              Modo N8N Expert ativo
              {n8nMode === "auto" && (
                <span className="ml-1 text-rose-400/70 font-normal">· detectado automaticamente</span>
              )}
            </span>
            <button
              onClick={() => setN8nMode("off")}
              className="rounded-md p-0.5 text-rose-400/60 hover:text-rose-400 transition-colors"
              title="Desativar modo N8N"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── No settings info ── */}
      {messages.length === 0 && !loading && !serverUrl && (
        <div className="mx-4 mb-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Operando via IA interna (Groq). Configure <strong>Server URL</strong> + <strong>HOK_TOKEN</strong> nas Configurações para conectar ao servidor HOK.
        </div>
      )}

      {/* ── Hidden file inputs ── */}
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
      <input ref={fileInputRef}  type="file" multiple className="hidden" onChange={handleFileChange} />
      <input ref={audioInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleAudioChange} />

      {/* ── Input area ── */}
      <div className="hok-composer relative z-50 border-t border-border bg-background/90 px-4 pb-[calc(env(safe-area-inset-bottom)+128px)] pt-3 backdrop-blur-xl">

        {/* Attachment preview strip */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-2 flex gap-2 overflow-x-auto pb-1 thin-scroll"
            >
              {attachments.map((att) => (
                <motion.div
                  key={att.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="relative shrink-0 flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5"
                >
                  {/* Thumbnail para imagem */}
                  {att.type === "image" && att.dataUrl ? (
                    <img src={att.dataUrl} alt={att.name} className="h-8 w-8 rounded-lg object-cover" />
                  ) : att.type === "audio" ? (
                    <FileAudio className="h-4 w-4 shrink-0 text-[color:var(--amber)]" />
                  ) : (
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="max-w-[80px] truncate text-[11px] text-muted-foreground">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Row 1: IA + ENGINE selectors (UX v5) */}
        <div className="mb-2 flex gap-2">
          {/* IA — button-model-selector */}
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => { setShowModelsPicker((v) => !v); setShowEnginePicker(false); }}
              className="hok-console-button flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-secondary px-2.5 py-2 text-left hover:border-[color:var(--amber)]/60"
              aria-expanded={showModelsPicker}
              aria-controls="model-menu"
              data-testid="button-model-selector"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground">⚡ IA</span>
                <span className="truncate text-[12px] font-semibold" style={{ color: activeModel.color }}>{activeModel.label}</span>
              </span>
              {showModelsPicker ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {showModelsPicker && (
                <motion.div
                  id="model-menu"
                  initial={{ opacity: 0, y: 5, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.98 }}
                  className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[min(340px,calc(100vw-20px))]"
                >
                  <div className="thin-scroll max-h-[min(320px,50dvh)] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-[0_16px_34px_rgb(0_0_0/0.45)]">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Catálogo de IA</span>
                      <div className="flex items-center gap-1.5">
                        {!modelsList && <span className="font-mono text-[9px] text-[color:var(--amber)]">sincronizando</span>}
                        <button
                          type="button"
                          onClick={() => setShowModelsPicker(false)}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-[color:var(--amber)]/10 hover:text-[color:var(--amber)]"
                          aria-label="Fechar catálogo"
                          data-testid="button-model-picker-close"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mb-1 px-1">
                      <input
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="Buscar modelo por nome..."
                        className="w-full rounded-xl border border-border bg-background px-2.5 py-1.5 text-[11px] outline-none placeholder:text-muted-foreground focus:border-[color:var(--amber)]"
                        data-testid="input-model-search"
                      />
                    </div>
                    {modelMenuError && (
                      <div className="mb-1 rounded-xl border border-red-500/20 bg-red-500/5 px-2.5 py-2 text-[10px] text-red-300">
                        <div>{modelMenuError}</div>
                        <button
                          type="button"
                          onClick={() => { setModelMenuError(null); setModelsList(null); setModelMenuRetry((v) => v + 1); }}
                          className="mt-1 font-semibold text-[color:var(--amber)] hover:underline"
                        >
                          Tentar novamente
                        </button>
                      </div>
                    )}
                    {!modelsList ? (
                      <div className="space-y-1 px-1 pb-1" aria-label="Carregando modelos">
                        <div className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
                        <div className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
                        <div className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
                      </div>
                    ) : (
                      <ModelCatalogList modelsList={modelsList} search={modelSearch} activeModelId={activeModelId} onSelect={selectModel} />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {showModelsPicker && <div className="fixed inset-0 z-30" onClick={() => setShowModelsPicker(false)} aria-hidden="true" />}
          </div>

          {/* ENGINE — button-engine-selector */}
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => { setShowEnginePicker((v) => !v); setShowModelsPicker(false); }}
              className={cn(
                "hok-console-button flex w-full items-center justify-between gap-2 rounded-xl border bg-secondary px-2.5 py-2 text-left hover:border-[color:var(--amber)]/60",
                forcedEngine !== "auto" ? "border-rose-500/40" : "border-border",
              )}
              aria-expanded={showEnginePicker}
              aria-controls="engine-menu"
              data-testid="button-engine-selector"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground">◈<span className="max-[440px]:hidden"> ENGINE</span></span>
                <span className={cn("truncate", ENGINE_BRAND[forcedEngine] || (forcedEngine === "auto" && "text-[12px] font-semibold text-[color:var(--amber)]"))}>
                {forcedEngine === "hok" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-black px-1.5 py-0.5">
                    <span className="hok-h">Hok</span>
                            <span className="hok-orq">OS</span>
                  </span>
                ) : forcedEngine === "opencode" ? (
                  <span className="inline-flex items-center rounded-md bg-black px-1.5 py-[3px] shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
                    {/* Logo oficial do opencode — wordmark SVG em blocos pixel, variante fundo escuro */}
                    <img src="/assets/opencode-logo.svg" alt="OpenCode Terminal" className="h-[12px] w-auto" />
                  </span>
                ) : engineLabel}
              </span>
              </span>
              {showEnginePicker ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {showEnginePicker && (
                <motion.div
                  id="engine-menu"
                  initial={{ opacity: 0, y: 5, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.98 }}
                  className="absolute bottom-[calc(100%+8px)] right-0 z-40 w-[min(250px,calc(100vw-20px))] rounded-2xl border border-border bg-popover p-1.5 shadow-[0_16px_34px_rgb(0_0_0/0.45)]"
                >
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Motor de processamento</span>
                    <button
                      type="button"
                      onClick={() => setShowEnginePicker(false)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-[color:var(--amber)]/10 hover:text-[color:var(--amber)]"
                      aria-label="Fechar seletor de engine"
                      data-testid="button-mode-picker-close"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {ENGINE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => { setForcedEngine(opt.id); setShowEnginePicker(false); }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-[11px] text-left transition-colors hover:bg-[color:var(--amber)]/10",
                        forcedEngine === opt.id ? "text-[color:var(--amber)]" : "text-foreground",
                      )}
                    >
                      <span className={cn("flex items-center gap-2", ENGINE_BRAND[opt.id], opt.id === "auto" && "font-mono text-[11px]")}>
                        {opt.Icon && <opt.Icon className="h-3.5 w-3.5 shrink-0" />}
                        {opt.id === "hok" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-black px-1.5 py-0.5">
                            <span className="hok-h">Hok</span>
                    <span className="hok-orq">OS</span>
                            {opt.sub && <span className="text-[9px] text-white/70">({opt.sub})</span>}
                          </span>
                        ) : opt.id === "opencode" ? (
                          <span className="inline-flex items-center rounded-md bg-black px-2 py-[5px] shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
                            {/* Logo oficial do opencode: wordmark SVG em blocos pixel (não é fonte instalável) — variante p/ fundo escuro */}
                            <img src="/assets/opencode-logo.svg" alt="OpenCode Terminal" className="h-[14px] w-auto" />
                          </span>
                        ) : (
                          <>
                            {opt.label}
                            {opt.sub && <span className="text-[9px] text-muted-foreground">({opt.sub})</span>}
                          </>
                        )}
                      </span>
                      {forcedEngine === opt.id && <span className="text-[color:var(--amber)]">✔</span>}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* MODE SELECTOR (29/08): Planejar/Construir/Autônomo/Total +
        checkpoint + rollback + auto_rollback — estado via /session/mode */}
        <ModeSelector conversationId={conversationId} />

        {/* Row 2: + menu / textarea / tools */}
        <div className="flex items-end gap-2 rounded-2xl border bg-popover px-2.5 py-2 transition-all focus-within:border-[color:var(--amber)] focus-within:shadow-[var(--shadow-amber-glow)]">
          {/* + menu */}
          <div className="relative pb-0.5">
            <button
              type="button"
              onClick={() => setShowAttachMenu((v) => !v)}
              className="hok-console-button flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-[color:var(--amber)] hover:border-[color:var(--amber)]/60 hover:bg-[color:var(--amber)]/10"
              aria-label="Adicionar anexo"
              aria-expanded={showAttachMenu}
              data-testid="button-open-attachments"
            >
              <Plus className={cn("h-4 w-4 transition-transform", showAttachMenu && "rotate-45")} />
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.98 }}
                  className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[190px] rounded-2xl border border-border bg-popover p-1.5 shadow-[0_16px_34px_rgb(0_0_0/0.45)]"
                >
                  <div className="flex items-center justify-end px-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowAttachMenu(false)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-[color:var(--amber)]/10 hover:text-[color:var(--amber)]"
                      aria-label="Fechar menu de anexos"
                      data-testid="button-plus-menu-close"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => { photoInputRef.current?.click(); setShowAttachMenu(false); }}
                      className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[10px] text-muted-foreground hover:bg-[color:var(--amber)]/10 hover:text-[color:var(--amber)]"
                      data-testid="button-attach-photo"
                    >
                      <ImageIcon className="h-4 w-4" />
                      Foto
                    </button>
                    <button
                      type="button"
                      onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                      className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[10px] text-muted-foreground hover:bg-[color:var(--amber)]/10 hover:text-[color:var(--amber)]"
                      data-testid="button-attach-file"
                    >
                      <Paperclip className="h-4 w-4" />
                      Arquivo
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWebSearch((v) => !v); setShowAttachMenu(false); }}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[10px] transition-colors",
                        webSearch
                          ? "bg-[color:var(--amber)]/10 text-[color:var(--amber)]"
                          : "text-muted-foreground hover:bg-[color:var(--amber)]/10 hover:text-[color:var(--amber)]",
                      )}
                      data-testid="button-web-search"
                    >
                      <Globe className="h-4 w-4" />
                      Busca Web
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDebugMode((v) => !v); setShowAttachMenu(false); }}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[10px] transition-colors",
                        debugMode
                          ? "bg-red-500/10 text-red-500"
                          : "text-muted-foreground hover:bg-red-500/10 hover:text-red-500",
                      )}
                      data-testid="button-debug-mode"
                    >
                      <Bug className="h-4 w-4" />
                      Debug
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {showAttachMenu && <div className="fixed inset-0 z-30" onClick={() => setShowAttachMenu(false)} aria-hidden="true" />}
          </div>

          <div className="mb-1 h-5 w-px shrink-0 bg-border" />

          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Insira sua instrução, Sr.…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            style={{ maxHeight: 120 }}
          />
          <div className="flex items-center gap-1 pb-0.5">
            {/* Mic */}
            <button
              type="button"
              onClick={() => (isRecording ? stopRecording() : startRecording())}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                isRecording
                  ? "bg-red-500/15 text-red-500 animate-pulse"
                  : "text-muted-foreground hover:bg-accent hover:text-[color:var(--amber)]",
              )}
              aria-label="Anexar áudio pelo microfone"
              title="Anexar áudio"
              data-testid="button-microphone"
            >
              <Mic className="h-4 w-4" />
            </button>

            {/* Send / Stop */}
            {loading ? (
              <button
                onClick={stop}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25"
                aria-label="Parar"
                data-testid="button-stop"
              >
                <span className="h-3 w-3 rounded-sm bg-destructive" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() && attachments.length === 0}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition",
                  (input.trim() || attachments.length > 0)
                    ? "bg-[color:var(--amber)] text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)]"
                    : "bg-muted text-muted-foreground",
                )}
                aria-label="Enviar"
                data-testid="button-send"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </OwnerGate>
  );
}
