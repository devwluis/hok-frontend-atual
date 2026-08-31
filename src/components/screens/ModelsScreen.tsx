"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, Check, Sparkles, ChevronRight } from "lucide-react";
import { ScreenFrame, ScreenHeader } from "@/components/shell/ScreenFrame";
import { cn } from "@/lib/utils";
import {
  getModels,
  invalidateModelsCache,
  searchModels,
  getFreeModelsFromAll,
  SHOW_PAID_MODELS,
  type HokModel,
} from "@/lib/hok-models";

const ICON_SRCS = {
  auto: "/icons/chat-hok.png",
  claude_code: "/icons/claude-code.png",
  opencode: "/icons/opencode.png",
  hermes: "/icons/hermes.png",
} as const;

const ENGINE_CARDS = [
  { id: "auto", label: "Automático", src: ICON_SRCS.auto },
  { id: "claude_code", label: "Claude Code", src: ICON_SRCS.claude_code },
  { id: "opencode", label: "OpenCode", src: ICON_SRCS.opencode },
  { id: "hermes", label: "Hermes", src: ICON_SRCS.hermes },
] as const;

type EngineId = (typeof ENGINE_CARDS)[number]["id"];

function readSettings(): { serverUrl: string; token: string } {
  try {
    const raw = localStorage.getItem("hokma.settings.v1");
    if (!raw) return { serverUrl: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return { serverUrl: s["Server URL"] || "", token: s["HOK_TOKEN"] || "" };
  } catch {
    return { serverUrl: "", token: "" };
  }
}

export function ModelsScreen() {
  const [all, setAll] = useState<HokModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState<EngineId>("auto");
  const [activeId, setActiveId] = useState<string>("auto");
  const [saving, setSaving] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);

  useEffect(() => {
    let alive = true;
    getModels()
      .then((m) => {
        if (!alive) return;
        setAll(m);
        const catalogActive = (m as unknown as { _active?: string })._active;
        if (catalogActive) setActiveId(catalogActive);
      })
      .catch(() => { /* fallback silencioso */ })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => searchModels(all, query), [all, query]);

  const groups = useMemo(() => {
    // "Somente gratuitos": um único grupo "Modelos Gratuitos" combinando
    // Zen + Go + OpenRouter com custo zero.
    if (onlyFree) {
      const free = getFreeModelsFromAll(filtered);
      return [{
        title: "Modelos Gratuitos (Zen + Go + OpenRouter)",
        badge: "FREE",
        badgeClass: "bg-[color:var(--emerald)]/15 text-[color:var(--emerald)]",
        items: free,
      }];
    }
    // Agrupamento por provedor e custo.
    const zen = filtered.filter((m) => m.provider === "OpenCode Zen");
    const go = filtered.filter((m) => m.provider === "OpenCode Go");
    const or = filtered.filter((m) => m.provider !== "OpenCode Zen" && m.provider !== "OpenCode Go");
    return [
      { title: "OpenCode Zen — FREE", badge: "FREE", badgeClass: "bg-[color:var(--emerald)]/15 text-[color:var(--emerald)]", items: zen.filter((m) => m.free) },
      ...(SHOW_PAID_MODELS ? [{ title: "OpenCode Zen — PAGO", badge: "PAGO", badgeClass: "bg-[color:var(--amber)]/15 text-[color:var(--amber)]", items: zen.filter((m) => !m.free) }] : []),
      { title: "OpenCode Go — FREE", badge: "FREE", badgeClass: "bg-[color:var(--emerald)]/15 text-[color:var(--emerald)]", items: go.filter((m) => m.free) },
      ...(SHOW_PAID_MODELS ? [{ title: "OpenCode Go — PAGO", badge: "PAGO", badgeClass: "bg-[color:var(--amber)]/15 text-[color:var(--amber)]", items: go.filter((m) => !m.free) }] : []),
      { title: "OpenRouter — FREE", badge: "FREE", badgeClass: "bg-[color:var(--emerald)]/15 text-[color:var(--emerald)]", items: or.filter((m) => m.free) },
      ...(SHOW_PAID_MODELS ? [{ title: "OpenRouter — PAGO", badge: "PAGO", badgeClass: "bg-[color:var(--amber)]/15 text-[color:var(--amber)]", items: or.filter((m) => !m.free) }] : []),
    ];
  }, [filtered, onlyFree]);

  const selectModel = async (m: HokModel) => {
    setSaving(true);
    setActiveId(m.id);
    const { serverUrl, token } = readSettings();
    if (serverUrl && token) {
      try {
        await fetch(`${serverUrl.replace(/\/$/, "")}/models/select`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Hok-Token": token },
          body: JSON.stringify({ model: m.id }),
        });
        invalidateModelsCache();
      } catch { /* offline: mantém local */ }
    }
    setSaving(false);
  };

  const activeModel = all.find((m) => m.id === activeId);

  const rows: { title: string; badge: string; badgeClass: string; items: HokModel[] }[] = groups;

  return (
    <ScreenFrame noPad>
      <div className="px-4 pt-4 pb-3">
        <ScreenHeader title="Modelos" subtitle="Catálogo unificado OpenCode Zen + OpenRouter." />

        {/* Seletor de motor — 4 cartões */}
        <div className="grid grid-cols-4 gap-1.5">
          {ENGINE_CARDS.map(({ id, label, src }) => {
            const active = engine === id;
            return (
              <button
                key={id}
                onClick={() => setEngine(id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border px-1 py-2 transition-all",
                  active ? "border-transparent shadow-lg" : "border-border bg-card opacity-70 hover:opacity-100",
                )}
              >
                <img src={src} alt={label} className="h-5 w-5" />
                <span className="text-[9px] font-medium leading-tight text-center">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Busca */}
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar modelo… (ex: free, deepseek, claude, gemini)"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>

        {/* Toggle somente gratuitos */}
        <button
          type="button"
          onClick={() => setOnlyFree((v) => !v)}
          className={cn(
            "mt-2 flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition-colors",
            onlyFree
              ? "border-[color:var(--emerald)]/50 bg-[color:var(--emerald)]/10"
              : "border-border bg-card hover:opacity-90",
          )}
        >
          <span className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--emerald)]" />
            Somente modelos gratuitos
          </span>
          <span
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              onlyFree ? "bg-[color:var(--emerald)]" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                onlyFree ? "left-[18px]" : "left-0.5",
              )}
            />
          </span>
        </button>

        {/* Banner modelo ativo */}
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[color:var(--cyan-glow)]/30 bg-[color:var(--cyan-glow)]/10 px-3 py-2">
          <Sparkles className="h-4 w-4 shrink-0 text-[color:var(--cyan-glow)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-widest text-[color:var(--cyan-glow)]">
              Modelo ativo global
            </div>
            <div className="truncate font-mono text-[12px] font-medium" style={{ color: activeModel?.color ?? "#f5b942" }}>
              {loading ? "carregando…" : (activeModel?.label ?? activeId)}
              {saving && <span className="ml-2 text-[10px] text-muted-foreground">salvando…</span>}
            </div>
          </div>
          {activeModel && (
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-mono font-medium"
              style={{ borderColor: `${activeModel.color}66`, color: activeModel.color, background: `${activeModel.color}14` }}
            >
              {activeModel.provider}
            </span>
          )}
        </div>
      </div>

      {/* Listas horizontais */}
      <div className="thin-scroll flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="py-8 text-center font-mono text-xs text-muted-foreground">Carregando catálogo…</div>
        ) : (
          rows.map(({ title, badge, badgeClass, items }) => (
            <div key={title} className="mt-3">
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-bold", badgeClass)}>{badge}</span>
                <span className="ml-auto text-[9px] font-mono text-muted-foreground/70">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-2 text-[10px] text-muted-foreground">
                  Nenhum modelo encontrado
                </div>
              ) : (
                <ul className="space-y-1">
                  {items.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <span className="text-[9px] font-mono truncate">{m.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))) }
      </div>
    </ScreenFrame>
  );
}
