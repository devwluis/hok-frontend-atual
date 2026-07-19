"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Bug, Send, Copy, Webhook, ChevronDown, ChevronUp, Workflow, X, Image as ImageIcon, Paperclip, Mic, FileAudio } from "lucide-react";
import { ElectricCore } from "@/components/chat/ElectricCore";
import { NuclearCore } from "@/components/chat/NuclearCore";
import { cn } from "@/lib/utils";
import { conversationsStore, type ChatMessage } from "@/lib/conversations-store";
import { useAppState } from "@/hooks/use-app-state";
import { HOK_MODELS, getModel } from "@/lib/hok-models";
import { type PendingAction } from "@/lib/chat-stream";
import { detectN8NIntent, N8N_SYSTEM_PROMPT, type N8NModeState } from "@/lib/n8n-expert";

// Unified settings key
const SETTINGS_KEY = "hokma.settings.v1";
const N8N_SETTINGS_KEY = "hokma.n8n.settings.v1";

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

function extractJsonBlock(text: string): string | null {
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

// ── JSON block inside assistant bubble ────────────────────────────────────────
function JsonBlock({ json, onSendToWebhook }: { json: string; onSendToWebhook?: (j: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800 bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">json</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-800/80 px-2 py-1 text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
          >
            <Copy className="h-3 w-3" /> {copied ? "Copiado" : "Copy JSON"}
          </button>
          {onSendToWebhook && (
            <button
              onClick={() => onSendToWebhook(json)}
              className="inline-flex items-center gap-1 rounded-md bg-[color:var(--amber)]/90 px-2 py-1 text-[10px] font-semibold text-[color:var(--amber-foreground)] hover:opacity-90"
            >
              <Webhook className="h-3 w-3" /> Webhook
            </button>
          )}
        </div>
      </div>
      <pre className="thin-scroll max-h-72 overflow-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-emerald-300">
        {json}
      </pre>
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
  const jsonBlock = !isUser ? extractJsonBlock(msg.text) : null;
  const bodyText = jsonBlock ? msg.text.replace(/```json[\s\S]*?```/i, "").trim() : msg.text;
  const modelInfo = !isUser && msg.meta?.model ? getModel(msg.meta.model) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "relative max-w-[85%] px-4 py-3 text-sm shadow-sm",
          isUser
            ? "rounded-[20px] rounded-br-md bg-[color:var(--amber)] text-[color:var(--amber-foreground)]"
            : "rounded-[20px] rounded-bl-md border border-border bg-card text-card-foreground",
        )}
      >
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
        {bodyText && <div className="whitespace-pre-wrap leading-relaxed">{bodyText}</div>}
        {jsonBlock && <JsonBlock json={jsonBlock} onSendToWebhook={onSendToWebhook} />}
        {!isUser && msg.pendingAction && (
          <div className="mt-2 flex gap-2 border-t border-border/60 pt-2">
            <button onClick={onApprovePending} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25">Aprovar</button>
            <button onClick={onRejectPending} className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/25">Rejeitar</button>
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

// ── Model picker strip ────────────────────────────────────────────────────────
function ModelPicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 thin-scroll">
      {HOK_MODELS.map((m) => (
        <button
          key={m.id}
          onClick={() => onSelect(m.id)}
          title={m.description}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            selected === m.id
              ? "border-transparent text-black"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
          style={selected === m.id ? { background: m.color } : undefined}
        >
          <span className="text-[10px]">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function ChatScreen() {
  const { conversationId, setConversationId } = useAppState();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("auto");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [n8nMode, setN8nMode] = useState<N8NModeState>("off");
  const [chatMode, setChatMode] = useState<"build" | "plan">("build");
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

  // Load messages when conversation changes
  useEffect(() => {
    if (skipNextReloadRef.current) { skipNextReloadRef.current = false; return; }
    if (!conversationId) { setMessages([]); return; }
    const conv = conversationsStore.get(conversationId);
    setMessages(conv ? (conv.messages as Msg[]) : []);
  }, [conversationId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

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
      const res = await fetch(baseUrl.replace(/\/$/, "") + path, { method: "POST", headers });
      const data = (await res.json()) as { reply?: string };
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
      setError("Falha ao processar a ação pendente.");
    } finally {
      setPendingAction(null);
    }
  };

  const send = async () => {
    const t = input.trim();
    if ((!t && attachments.length === 0) || loading) return;

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
    const endpointPath = serverUrl ? "/chat/smart" : "/api/chat";
    const assistantId = crypto.randomUUID();
    const startedAt = performance.now();

    abortRef.current = new AbortController();

    // Build messages — inject N8N system prompt at the top when active
    const outMessages: { role: "user" | "assistant" | "system"; content: string }[] = [
      ...(isN8N ? [{ role: "system" as const, content: N8N_SYSTEM_PROMPT }] : []),
      ...afterUser.map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
    ];

    try {
      const { streamChat } = await import("@/lib/chat-stream");
      await streamChat({
        baseUrl,
        endpointPath,
        token,
        webSearch,
        selectedModel,
        messages: outMessages,
        imageB64,
        imageMime: imageB64 ? imageMime : undefined,
        audioB64,
        audioMime: audioB64 ? audioMime : undefined,
        mode: chatMode,
        onPendingAction: (pa) => { pendingActionRef.current = pa; setPendingAction(pa); },
        signal: abortRef.current.signal,
        onToken: (delta) => {
          accRef.current += delta;
          const text = accRef.current;
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === assistantId);
            return exists
              ? prev.map((m) => (m.id === assistantId ? { ...m, text } : m))
              : [...prev, { id: assistantId, role: "assistant" as const, text }];
          });
        },
      });

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
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const { serverUrl } = readSettings();

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Messages ── */}
      <div className="thin-scroll flex-1 overflow-y-auto px-4 py-4">
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
                  label="Processando requisição…"
                  modelName={activeModel.id !== "auto" ? activeModel.label : undefined}
                />
              </div>
            </motion.div>
          )}
        </div>
        <div ref={endRef} />
      </div>

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
            <Workflow className="h-3.5 w-3.5 shrink-0 text-rose-500" />
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
      <div className="border-t border-border bg-card/80 px-4 pb-[calc(env(safe-area-inset-bottom)+80px)] pt-3 backdrop-blur-xl">

        {/* Model picker (collapsible) */}
        <AnimatePresence>
          {showModelPicker && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-2"
            >
              <ModelPicker selected={selectedModel} onSelect={(id) => { setSelectedModel(id); setShowModelPicker(false); }} />
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* Textarea row */}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2 focus-within:border-[color:var(--amber)] focus-within:shadow-[var(--shadow-amber-glow)] transition-all">
          {/* Attachment buttons — left side */}
          <div className="flex items-center gap-0.5 pb-0.5">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-[color:var(--amber)]"
              aria-label="Foto"
              title="Anexar foto"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Arquivo"
              title="Anexar arquivo"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              onClick={() => (isRecording ? stopRecording() : startRecording())}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                isRecording
                  ? "bg-red-500/15 text-red-500 animate-pulse"
                  : "text-muted-foreground hover:bg-accent hover:text-[color:var(--amber)]",
              )}
              aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
              title={isRecording ? "Parar gravação" : "Gravar áudio"}
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>

          {/* Divider */}
          <div className="mb-1 h-5 w-px shrink-0 bg-border" />

          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Insira sua instrução, Sr.…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            style={{ maxHeight: 120 }}
          />
          <div className="flex items-center gap-1 pb-0.5">
            {/* Web search toggle */}
            <button
              onClick={() => setWebSearch((v) => !v)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                webSearch ? "bg-[color:var(--amber)]/15 text-[color:var(--amber)]" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-label="Busca web"
            >
              <Globe className="h-4 w-4" />
            </button>

            {/* Debug toggle */}
            <button
              onClick={() => setDebugMode((v) => !v)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                debugMode ? "bg-red-500/15 text-red-500" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-label="Debug"
            >
              <Bug className="h-4 w-4" />
            </button>

            {/* Send / Stop */}
            {loading ? (
              <button
                onClick={stop}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25"
                aria-label="Parar"
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
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom bar: model selector trigger + hint */}
        <div className="mt-1.5 flex items-center gap-2 px-1">
          <button
            onClick={() => setShowModelPicker((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-[color:var(--amber)]/40"
            style={{ color: activeModel.color }}
          >
            <span className="font-mono">{activeModel.label}</span>
            {showModelPicker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {/* N8N mode toggle */}
          <div className="flex items-center overflow-hidden rounded-full border border-border bg-card text-[10px] font-mono font-medium">
            <button
              onClick={() => setChatMode("plan")}
              className={cn("px-2 py-0.5 transition-colors", chatMode === "plan" ? "bg-[color:var(--amber)] text-[color:var(--amber-foreground)]" : "text-muted-foreground hover:text-foreground")}
            >Planejar</button>
            <button
              onClick={() => setChatMode("build")}
              className={cn("px-2 py-0.5 transition-colors", chatMode === "build" ? "bg-[color:var(--amber)] text-[color:var(--amber-foreground)]" : "text-muted-foreground hover:text-foreground")}
            >Build</button>
          </div>
          <button
            onClick={() => setN8nMode((v) => v === "off" ? "manual" : "off")}
            title={n8nActive ? "Desativar Modo N8N" : "Ativar Modo N8N Expert"}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium transition-all",
              n8nActive
                ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                : "border-border bg-card text-muted-foreground hover:border-rose-500/30 hover:text-rose-400",
            )}
          >
            <Workflow className="h-3 w-3" />
            N8N
          </button>

          {webSearch && (
            <span className="text-[10px] font-mono text-[color:var(--cyan-glow)]">web:on</span>
          )}
          {debugMode && (
            <span className="text-[10px] font-mono text-red-500">debug:on</span>
          )}

          <span className="ml-auto text-[10px] text-muted-foreground">Enter · Shift↵</span>
        </div>
      </div>
    </div>
  );
}
