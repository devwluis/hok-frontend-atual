// SSE / NDJSON streaming client for the HOK backend and internal /api/chat endpoint.
// HOK backend sends NDJSON lines {"token":"..."} / {"delta":"..."} — no "data:" prefix needed.
// We always read line-by-line; SSE "data:" prefix is stripped when present.

export type StreamMsg = { role: "user" | "assistant" | "system"; content: string };
export type PendingAction = { id: string; tool_name: string; description: string; created_at: string; action_type?: string; diff_preview?: string };

export type StreamOpts = {
  baseUrl: string;
  endpointPath?: string;
  token?: string;
  messages: StreamMsg[];
  webSearch?: boolean;
  forceClaudeCode?: boolean;
  forceHermes?: boolean;
  forceOpenCode?: boolean;
  selectedModel?: string;
  imageB64?: string;
  imageMime?: string;
  audioB64?: string;
  audioMime?: string;
  mode?: "plan" | "build";
  conversationId?: string | null;
  onPendingAction?: (pa: PendingAction | null) => void;
  onEngineUsed?: (engine: string) => void;
  onModelUsed?: (model: string) => void;
  signal?: AbortSignal;
  onToken: (delta: string) => void;
};

function extractEngineUsed(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const e = p.engine_used ?? p.engineUsed;
  return typeof e === "string" && e ? e : null;
}
function extractModelUsed(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const m = p.model_used ?? p.modelUsed ?? p.model;
  return typeof m === "string" && m ? m : null;
}
function extractPendingAction(payload: unknown): PendingAction | null {
  if (payload == null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const pa = p.pendingAction ?? p.pending_action;
  if (pa && typeof pa === "object") {
    const o = pa as Record<string, unknown>;
    return {
      id: String(o.id ?? ""),
      tool_name: String(o.tool_name ?? ""),
      description: String(o.description ?? ""),
      created_at: String(o.created_at ?? ""),
      action_type: String(o.action_type ?? o.actionType ?? ""),
      diff_preview: String(o.diff_preview ?? o.diffPreview ?? ""),
    };
  }
  return null;
}

function extractDelta(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  const p = payload as Record<string, unknown>;

  // HOK-native formats
  if (typeof p.token === "string") return p.token;
  if (typeof p.delta === "string") return p.delta;
  if (typeof p.content === "string") return p.content;
  if (typeof p.text === "string") return p.text;
  if (typeof p.response === "string") return p.response;
  if (typeof p.reply === "string") return p.reply;

  // OpenAI-style SSE chunk
  const choices = p.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0] as Record<string, unknown>;
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === "string") return delta.content;
    const msg = choice.message as Record<string, unknown> | undefined;
    if (typeof msg?.content === "string") return msg.content;
    if (typeof choice.text === "string") return choice.text;
  }

  // Anthropic-style
  if (p.type === "content_block_delta") {
    const d = p.delta as Record<string, unknown> | undefined;
    if (typeof d?.text === "string") return d.text;
  }

  return "";
}

/** Parse one raw line — handles SSE `data:` prefix and bare NDJSON */
function parseLine(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line) return null;
  if (line.startsWith(":") || line.startsWith("event:") || line.startsWith("id:") || line.startsWith("retry:")) return null;
  if (line === "data: [DONE]" || line === "[DONE]") return null;

  let dataStr = line;
  if (line.startsWith("data:")) {
    dataStr = line.slice(5).trim();
    if (dataStr === "[DONE]") return null;
  }

  try {
    return extractDelta(JSON.parse(dataStr)) || null;
  } catch {
    // Return bare text line if non-empty and looks like content
    return dataStr.length > 0 && !dataStr.startsWith("{") ? dataStr : null;
  }
}

export async function streamChat(opts: StreamOpts): Promise<string> {
  const {
    baseUrl,
    endpointPath = "/chat/smart",
    token,
    messages,
    webSearch,
    forceClaudeCode,
    forceHermes,
    forceOpenCode,
    selectedModel = "auto",
    imageB64,
    imageMime,
    audioB64,
    audioMime,
    mode,
    conversationId,
    onPendingAction,
    onEngineUsed,
    onModelUsed,
    signal,
    onToken,
  } = opts;

  const url = baseUrl.replace(/\/$/, "") + endpointPath;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream, application/x-ndjson, application/json;q=0.9, */*;q=0.5",
  };

  if (token) {
    if (token.toLowerCase().startsWith("bearer ")) {
      headers["Authorization"] = token;
    } else {
      headers["X-Hok-Token"] = token;
    }
  }
  if (conversationId) {
    headers["X-Conversation-Id"] = conversationId;
  }

  // HOK backend contract:
  //   `message`  — REQUIRED: last user turn as plain string
  //   `messages` — full conversation history
  //   `model`    — model selector ("auto" lets backend pick best)
  //   `stream`   — true for SSE/NDJSON streaming
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const bodyObj: Record<string, unknown> = {
    message: lastUserMessage,
    messages,
    history: messages,
    model: selectedModel,
    stream: true,
    // FIX 16/08 (auditoria UX): backend Go espera `webSearch` (camelCase,
    // types.go ClientRequest). `web_search` (snake) era ignorado pelo
    // decode do Go — o toggle de busca web ficava decorativo.
    // Envia AMBOS por compatibilidade com clientes antigos do app interno.
    webSearch: !!webSearch,
    web_search: !!webSearch,
    forceClaudeCode: !!forceClaudeCode,
    forceHermes: !!forceHermes,
    forceOpenCode: !!forceOpenCode,
    ...(mode ? { mode } : {}),
    ...(imageB64 ? { image_b64: imageB64, image_mime: imageMime || "image/jpeg" } : {}),
    ...(audioB64 ? { audio_b64: audioB64, audio_mime: audioMime || "audio/webm" } : {}),
  };

  const body = JSON.stringify(bodyObj);

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body, signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new Error("Não foi possível conectar ao servidor. Verifique a URL nas configurações.");
  }

  if (!res.ok) {
    let errMsg = `Erro ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      if (data.error) errMsg = data.error;
      else if (data.message) errMsg = data.message;
    } catch {
      try { errMsg = `Erro ${res.status}: ${(await res.text()).slice(0, 120)}`; } catch { /* ignore */ }
    }
    throw new Error(errMsg);
  }

  let collected = "";

  // Always read line-by-line regardless of Content-Type
  if (res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) buf += decoder.decode(value, { stream: !streamDone });

      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const rawLine = buf.slice(0, idx).replace(/\r$/, "");
        buf = buf.slice(idx + 1);
        const delta = parseLine(rawLine);
        if (delta) {
          collected += delta;
          onToken(delta);
        }
        if (onPendingAction) {
          try {
            let dataStr = rawLine.trim();
            if (dataStr.startsWith("data:")) dataStr = dataStr.slice(5).trim();
            if (dataStr && dataStr !== "[DONE]") {
              const pa = extractPendingAction(JSON.parse(dataStr));
              if (pa) onPendingAction(pa);
            }
          } catch { /* ignore */ }
        }
        if (onEngineUsed) {
          try {
            let dataStr = rawLine.trim();
            if (dataStr.startsWith("data:")) dataStr = dataStr.slice(5).trim();
            if (dataStr && dataStr !== "[DONE]") {
              const eu = extractEngineUsed(JSON.parse(dataStr));
              if (eu) onEngineUsed(eu);
            }
          } catch { /* ignore */ }
        }
        if (onModelUsed) {
          try {
            let dataStr = rawLine.trim();
            if (dataStr.startsWith("data:")) dataStr = dataStr.slice(5).trim();
            if (dataStr && dataStr !== "[DONE]") {
              const mu = extractModelUsed(JSON.parse(dataStr));
              if (mu) onModelUsed(mu);
            }
          } catch { /* ignore */ }
        }
      }
    }

    // Flush remaining buffer (no trailing newline)
    if (buf.trim()) {
      const delta = parseLine(buf);
      if (delta) { collected += delta; onToken(delta); }
      if (onPendingAction) {
        try {
          let dataStr = buf.trim();
          if (dataStr.startsWith("data:")) dataStr = dataStr.slice(5).trim();
          const pa = extractPendingAction(JSON.parse(dataStr));
          if (pa) onPendingAction(pa);
        } catch { /* ignore */ }
      }
    }

    if (collected) return collected;
  }

  // Last resort: entire body as single JSON
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as unknown;
      if (onPendingAction) onPendingAction(extractPendingAction(json));
      if (onEngineUsed) { const eu = extractEngineUsed(json); if (eu) onEngineUsed(eu); }
      if (onModelUsed) { const mu = extractModelUsed(json); if (mu) onModelUsed(mu); }
      const delta = extractDelta(json);
      if (delta) { onToken(delta); return delta; }
    } catch { /* not JSON */ }
    if (text.trim()) { onToken(text.trim()); return text.trim(); }
  } catch { /* ignore */ }

  return collected;
}
// force rebuild 1786107025
// force rebuild 1786131361
