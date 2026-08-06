import pathlib
import shutil
import time

ROOT = pathlib.Path("/root/hokma-web/artifacts/hok-os/src")
ts = time.strftime("%Y%m%d_%H%M%S")

OWNER_HASH = "5f6c0727ad559bbb67b55ef02cd79e47686e86e0a40696da7479983475f64887"

# ── 1. hook use-owner-auth.ts ──
hook_path = ROOT / "hooks" / "use-owner-auth.ts"
hook_content = f'''import {{ useCallback, useState }} from "react";

const OWNER_KEY = "hokma.owner.v1";
const OWNER_HASH = "{OWNER_HASH}";

async function sha256(text: string): Promise<string> {{
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}}

export function useOwnerAuth() {{
  const [isOwner, setIsOwner] = useState<boolean>(() => {{
    try {{
      return localStorage.getItem(OWNER_KEY) === "1";
    }} catch {{
      return false;
    }}
  }});

  const login = useCallback(async (password: string): Promise<boolean> => {{
    const hash = await sha256(password);
    if (hash === OWNER_HASH) {{
      try {{
        localStorage.setItem(OWNER_KEY, "1");
      }} catch {{}}
      setIsOwner(true);
      return true;
    }}
    return false;
  }}, []);

  const logout = useCallback(() => {{
    try {{
      localStorage.removeItem(OWNER_KEY);
    }} catch {{}}
    setIsOwner(false);
  }}, []);

  return {{ isOwner, login, logout }};
}}
'''
hook_path.parent.mkdir(parents=True, exist_ok=True)
hook_path.write_text(hook_content, encoding="utf-8")
print(f"criado: {hook_path}")

# ── 2. componente OwnerGate.tsx ──
gate_path = ROOT / "components" / "shell" / "OwnerGate.tsx"
gate_content = '''"use client";
import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { useOwnerAuth } from "@/hooks/use-owner-auth";

export function OwnerGate({ children, label = "Área restrita" }: { children: React.ReactNode; label?: string }) {
  const { isOwner, login } = useOwnerAuth();
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);

  if (isOwner) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setWrong(false);
    const ok = await login(password);
    setChecking(false);
    if (!ok) {
      setWrong(true);
      setPassword("");
    }
  };

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none h-full w-full select-none opacity-60 blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="flex w-[260px] flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-lg"
        >
          <Lock className="h-6 w-6 text-[color:var(--amber)]" />
          <div className="text-center">
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-[11px] text-muted-foreground">Modo demonstração — login necessário</div>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            autoFocus
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--amber)]"
          />
          {wrong && <div className="text-[11px] text-destructive">Senha incorreta.</div>}
          <button
            type="submit"
            disabled={checking || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--amber)] px-3 py-2 text-sm font-semibold text-[color:var(--amber-foreground)] disabled:opacity-50"
          >
            {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
'''
gate_path.parent.mkdir(parents=True, exist_ok=True)
gate_path.write_text(gate_content, encoding="utf-8")
print(f"criado: {gate_path}")

# ── 3. patch ChatScreen.tsx ──
chat_path = ROOT / "components" / "screens" / "ChatScreen.tsx"
chat_src = chat_path.read_text(encoding="utf-8")
shutil.copy(chat_path, chat_path.with_suffix(f".tsx.bak_{ts}"))

import_marker = 'import { detectN8NIntent, N8N_SYSTEM_PROMPT, type N8NModeState } from "@/lib/n8n-expert";'
assert chat_src.count(import_marker) == 1, "import marker não encontrado/duplicado em ChatScreen.tsx"
chat_src = chat_src.replace(
    import_marker,
    import_marker + '\nimport { OwnerGate } from "@/components/shell/OwnerGate";',
)

open_marker = '  return (\n    <div className="flex h-full flex-col bg-background">'
assert chat_src.count(open_marker) == 1, "abertura do return não encontrada/duplicada em ChatScreen.tsx"
chat_src = chat_src.replace(
    open_marker,
    '  return (\n    <OwnerGate label="Chat">\n    <div className="flex h-full flex-col bg-background">',
)

close_marker = '        </div>\n      </div>\n    </div>\n  );\n}'
assert chat_src.count(close_marker) == 1, "fechamento do return não encontrado/duplicado em ChatScreen.tsx"
chat_src = chat_src.replace(
    close_marker,
    '        </div>\n      </div>\n    </div>\n    </OwnerGate>\n  );\n}',
)

chat_path.write_text(chat_src, encoding="utf-8")
print(f"patch aplicado: {chat_path}")

# ── 4. patch CRMScreen.tsx ──
crm_path = ROOT / "components" / "screens" / "CRMScreen.tsx"
crm_src = crm_path.read_text(encoding="utf-8")
shutil.copy(crm_path, crm_path.with_suffix(f".tsx.bak_{ts}"))

crm_import_marker = 'import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";'
assert crm_src.count(crm_import_marker) == 1, "import marker não encontrado/duplicado em CRMScreen.tsx"
crm_src = crm_src.replace(
    crm_import_marker,
    crm_import_marker + '\nimport { OwnerGate } from "@/components/shell/OwnerGate";',
)

crm_open_marker = '  return (\n    <ScreenFrame>'
assert crm_src.count(crm_open_marker) == 1, "abertura do return não encontrada/duplicada em CRMScreen.tsx"
crm_src = crm_src.replace(
    crm_open_marker,
    '  return (\n    <OwnerGate label="CRM">\n    <ScreenFrame>',
)

crm_close_marker = '    </ScreenFrame>\n  );\n}'
assert crm_src.count(crm_close_marker) == 1, "fechamento do return não encontrado/duplicado em CRMScreen.tsx"
crm_src = crm_src.replace(
    crm_close_marker,
    '    </ScreenFrame>\n    </OwnerGate>\n  );\n}',
)

crm_path.write_text(crm_src, encoding="utf-8")
print(f"patch aplicado: {crm_path}")

print("OK — tudo aplicado. Backups salvos com sufixo .bak_" + ts)
