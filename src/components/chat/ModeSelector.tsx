import { useCallback, useEffect, useState } from "react";
import { Bot, Compass, Flame, Hammer, RotateCcw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── ModeSelector (29/08) ───────────────────────────────────────────────────
// 4 modos de sessão (Planejar/Construir/Autônomo/Autônomo Total) + badge do
// checkpoint + rollback manual + toggle auto_rollback. O estado real vem de
// GET /session/mode (a tabela é a fonte); cada clique faz POST /session/mode.

type SessionMode = "plan" | "build" | "autonomous" | "autonomous_total";

const MODES: { id: SessionMode; label: string; icon: typeof Compass; cls: string }[] = [
  { id: "plan", label: "Planejar", icon: Compass, cls: "text-sky-400" },
  { id: "build", label: "Construir", icon: Hammer, cls: "text-emerald-400" },
  { id: "autonomous", label: "Autônomo", icon: Bot, cls: "text-violet-400" },
  { id: "autonomous_total", label: "Autônomo Total", icon: Flame, cls: "text-[color:var(--amber)]" },
];

interface ModeState {
  mode: string;
  autonomous_budget: number;
  checkpoint_id: string;
  auto_rollback: boolean;
}

export default function ModeSelector({ conversationId }: { conversationId: string | null }) {
  const [st, setSt] = useState<ModeState>({ mode: "", autonomous_budget: 0, checkpoint_id: "", auto_rollback: false });
  const [budgetInput, setBudgetInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const api = useCallback(
    async (path: string, opts: RequestInit = {}) => {
      const raw = window.localStorage.getItem("hokma.settings.v1");
      const parsed = raw ? JSON.parse(raw) : {};
      const serverUrl = (parsed["Server URL"] || "").replace(/\/$/, "");
      const token = parsed["HOK_TOKEN"] || "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(opts.headers as Record<string, string>),
      };
      if (token) headers["X-Hok-Token"] = token;
      if (conversationId) headers["X-Conversation-Id"] = conversationId;
      const res = await fetch(`${serverUrl || window.location.origin}${path}`, { ...opts, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.status) throw new Error(`HTTP ${res.status}`);
      return data;
    },
    [conversationId],
  );

  const refresh = useCallback(async () => {
    try {
      const d = await api("/session/mode");
      setSt({ mode: d.mode || "", autonomous_budget: d.autonomous_budget ?? 0, checkpoint_id: d.checkpoint_id || "", auto_rollback: !!d.auto_rollback });
      setBudgetInput(d.autonomous_budget ? String(d.autonomous_budget) : "");
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "falha ao ler o modo");
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const parseBudget = (): number | null => {
    const n = Number(budgetInput);
    if (!budgetInput || Number.isNaN(n)) return null;
    return Math.min(200, Math.max(1, Math.round(n)));
  };

  const setMode = async (mode: SessionMode) => {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { mode };
      if (mode === "autonomous" || mode === "autonomous_total") {
        const b = parseBudget();
        if (b !== null) body.autonomous_budget = b;
      }
      if (mode === "autonomous_total") body.auto_rollback = st.auto_rollback;
      await api("/session/mode", { method: "POST", body: JSON.stringify(body) });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "falha ao ativar o modo");
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoRollback = async () => {
    setBusy(true);
    try {
      await api("/session/mode", { method: "POST", body: JSON.stringify({ mode: "autonomous_total", auto_rollback: !st.auto_rollback }) });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "falha ao salvar auto_rollback");
    } finally {
      setBusy(false);
    }
  };

  const applyBudget = async () => {
    if (!st.mode || (st.mode !== "autonomous" && st.mode !== "autonomous_total")) return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { mode: st.mode };
      const b = parseBudget();
      if (b !== null) body.autonomous_budget = b;
      if (st.mode === "autonomous_total") body.auto_rollback = st.auto_rollback;
      await api("/session/mode", { method: "POST", body: JSON.stringify(body) });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "falha ao aplicar o budget");
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    if (!st.checkpoint_id) return;
    if (!window.confirm("Rollback para o checkpoint " + st.checkpoint_id + "?\nO hokma e o hermes-gateway serão reiniciados brevemente.")) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await api("/recovery/rollback", { method: "POST", body: JSON.stringify({ checkpoint_id: st.checkpoint_id }) });
      setErr("rollback iniciado: " + (d.message || d.checkpoint_id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "falha ao disparar o rollback");
    } finally {
      setBusy(false);
    }
  };

  const active = st.mode || "plan";

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {MODES.map(({ id, label, icon: Icon, cls }) => (
        <button
          key={id}
          type="button"
          onClick={() => setMode(id)}
          disabled={busy}
          className={cn(
            "flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] transition-colors",
            active === id
              ? cn("bg-[color:var(--amber)]/15", cls)
              : "text-muted-foreground hover:bg-[color:var(--amber)]/10 hover:text-foreground",
          )}
          data-testid={`mode-${id}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
      {st.mode === "autonomous_total" && (
        <>
          <span className="flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5 text-[10px] text-muted-foreground" data-testid="checkpoint-badge">
            <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--amber)]" />
            {st.checkpoint_id ? `CPT ${st.checkpoint_id}` : "sem checkpoint"}
          </span>
          <button
            type="button"
            onClick={toggleAutoRollback}
            disabled={busy}
            className={cn(
              "flex items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] transition-colors",
              st.auto_rollback ? "bg-[color:var(--amber)]/15 text-[color:var(--amber)]" : "text-muted-foreground hover:bg-[color:var(--amber)]/10",
            )}
            data-testid="toggle-auto-rollback"
          >
            auto-rollback {st.auto_rollback ? "ON" : "OFF"}
          </button>
          {st.checkpoint_id && (
            <button
              type="button"
              onClick={rollback}
              disabled={busy}
              className="flex items-center gap-1 rounded-xl bg-red-500/10 px-2 py-1.5 text-[10px] text-red-400 transition-colors hover:bg-red-500/20"
              data-testid="button-rollback"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rollback
            </button>
          )}
        </>
      )}
      {(st.mode === "autonomous" || st.mode === "autonomous_total") && (
        <>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid="budget-input-wrap">
            Budget:
            <input
              type="number"
              min={1}
              max={200}
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyBudget();
              }}
              className="w-14 rounded-lg border border-border bg-background px-1.5 py-1 text-[10px] text-foreground outline-none focus:border-[color:var(--amber)]"
              data-testid="budget-input"
            />
            <button
              type="button"
              onClick={applyBudget}
              disabled={busy}
              className="rounded-lg bg-[color:var(--amber)]/15 px-1.5 py-1 text-[10px] text-[color:var(--amber)] hover:bg-[color:var(--amber)]/25"
              data-testid="budget-apply"
            >
              OK
            </button>
          </label>
          <span className="rounded-xl border border-border bg-card px-2 py-1.5 text-[10px] text-muted-foreground" data-testid="budget-badge">
            atual: {st.autonomous_budget}
          </span>
        </>
      )}
      {err && <span className="text-[10px] text-red-400">{err}</span>}
    </div>
  );
}