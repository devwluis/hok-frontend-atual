"use client";
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
