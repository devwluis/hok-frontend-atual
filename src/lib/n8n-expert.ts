// ── N8N Expert Mode ─────────────────────────────────────────────────────────
// Detects N8N-related intent and injects a specialized system prompt.

export const N8N_KEYWORDS = [
  // PT-BR — removidas palavras genericas do portugues (fluxo, no, nos,
  // execucao, executar) que causavam falso positivo com word-boundary;
  // mantidas frases compostas e termos especificos do N8N.
  "workflow", "fluxo de trabalho", "fluxos de trabalho",
  "automação", "automatizar", "automatize",
  "node", "nodes", "trigger", "gatilho",
  "webhook", "webservice", "agendar", "agendamento",
  "credencial", "credenciais", "schedule", "cron",
  "integracao", "integração", "conectar", "n8n",
  "http request", "rest api", "api call", "endpoint",
  "email", "slack", "telegram", "notion",
  "google sheets", "planilha", "banco de dados",
  "if node", "switch", "merge", "loop", "split",
  "code node", "function", "javascript no n8n",
  "set node", "variável", "expression", "expressão",
  "ai agent", "langchain", "chain", "rag", "embeddings",
  // EN
  "automation", "automate", "pipeline", "orchestrate",
  "subworkflow", "sub-workflow", "error workflow",
  "retry", "wait node", "respond to webhook",
  "sticky note", "pin data", "test workflow",
];

// FIX 16/08: word-boundary Unicode para evitar falso positivo por substring.
// Antes, "fluxo" casava dentro de "quando o fluxo aprovado executa..." e
// qualquer palavra-contendo-substring ativava o Modo N8N Expert à toa.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectN8NIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return N8N_KEYWORDS.some((kw) => {
    const escaped = escapeRegExp(kw.toLowerCase());
    // Fronteira de palavra Unicode: inicia em início de string ou após
    // não-letra/não-número; termina antes de letra/número (ou fim de string).
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=[^\\p{L}\\p{N}_]|$)`, "u");
    return re.test(lower);
  });
}

export const N8N_SYSTEM_PROMPT = `Você é um especialista sênior em N8N (n8n.io) e automação de workflows para desenvolvedores.

CONTEXTO: O usuário é um desenvolvedor focado em automações complexas N8N. Você deve:

## Quando responder sobre N8N:

1. **Sempre sugira nós específicos** pelo nome exato (ex: "HTTP Request Node", "Code Node", "If Node", "Webhook Trigger", "Schedule Trigger", "Set Node", "Merge Node")
2. **Forneça estrutura de workflow** quando relevante:
   - Trigger → Processamento → Ação
   - Mostre a sequência de nós com setas: Webhook → Set → HTTP Request → IF → Email
3. **Código no Code Node** — escreva JavaScript/TypeScript funcional para o Code Node quando necessário
4. **Expressões N8N** — use sintaxe correta: \`{{ $json.campo }}\`, \`{{ $node["Nome"].json }}\`, \`{{ $workflow.id }}\`
5. **Boas práticas**:
   - Error Workflow para tratamento de erros
   - Sticky Notes para documentação
   - Sub-workflows para lógica reutilizável
   - Pin Data para testes
6. **Integrações comuns**: Supabase, PostgreSQL, Redis, OpenAI, Anthropic, Slack, Telegram, Google Sheets, GitHub, Notion, Stripe

## Formato de resposta:

Para workflows, use este formato:
\`\`\`
ESTRUTURA DO WORKFLOW:
[Trigger: Webhook] → [Set: preparar dados] → [HTTP Request: chamar API] → [IF: checar resultado]
                                                                                    ↓ true          ↓ false
                                                                          [Email: notificar]  [Set: log erro]
\`\`\`

Para configurações de nó, seja específico:
- **Método**: POST
- **URL**: \`{{ $env.API_URL }}/endpoint\`
- **Authentication**: Header Auth → X-API-Key
- **Body**: JSON com \`{{ $json }}\`

Seja direto, técnico e prático. Priorize exemplos funcionais que o dev possa usar imediatamente.`;

export type N8NModeState = "off" | "auto" | "manual";
