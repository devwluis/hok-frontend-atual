"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Palette, Keyboard, Plus, Minus, X, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHELL_Z, aboveDock, keysReservePx } from "@/lib/shell-layers";
import { TERMINAL_THEMES } from "./SettingsScreen";

const RENEW_MARGIN_S = 60;
const RETRY_ERR_MS = 10_000;

// ── TESTE 1 — teclado estendido sobre ttyd ──────────────────────────────
// As teclas NÃO entram pelo iframe (cross-origin): são injetadas na sessão
// tmux "hok-ttyd" via POST /terminal/ttyd/key (tmux send-keys no backend),
// e o client ttyd anexado exibe em tempo real. Sticky Ctrl/Alt combinam com
// teclas nomeadas ("C-Left", "M-Up"); símbolos vão literais (-l).
type XKey = {
  label: string;
  tid?: string;
  send: () => { key?: string; text?: string };
};

let sticky = { ctrl: false, alt: false }; // espelhado em state p/ visual

function applyMods(label: string, name: string): { key?: string; text?: string } {
  if (sticky.ctrl && !/^F\d+$/.test(label)) {
    if (/^(Up|Down|Left|Right|Space|Enter|BSpace|Tab|BTab|Delete|Insert)$/.test(name))
      return { key: "C-" + name };
  }
  if (sticky.alt && !/^F\d+$/.test(label)) {
    if (/^(Up|Down|Left|Right|Delete|Insert)$/.test(name)) return { key: "M-" + name };
    return { text: "\x1b" };
  }
  return { key: name };
}

const k = (label: string, name: string): XKey => ({
  label,
  tid: name,
  send: () => applyMods(label, name),
});

// ADENDO barra Termius (23/08) — hierarquia de 2 níveis:
// Linha SEMPRE visível: Ctrl(sticky) · Esc · ← ↑ ↓ → · S-Tab (Shift+Tab).
// TUDO o resto fica atrás do botão "..." (grupo extra).
const ROW_KEYS: XKey[] = [
  k("←", "Left"), k("↑", "Up"), k("↓", "Down"), k("→", "Right"),
  { ...k("S-Tab", "BTab"), tid: "BTab" },
];
const NAV_EXTRA: XKey[] = [
  k("Home", "Home"), k("End", "End"),
  k("PgUp", "PageUp"), k("PgDn", "PageDown"),
  k("Ins", "Insert"), k("Del", "Delete"),
];
const EDIT_EXTRA: XKey[] = [
  k("Tab", "Tab"), k("Space", "Space"), k("⌫", "BSpace"), k("⏎", "Enter"),
];
const COMBO_KEYS: XKey[] = [
  { ...k("^W", "C-w"), tid: "Cw" },
  { ...k("^R", "C-r"), tid: "Cr" },
  { ...k("^X", "C-x"), tid: "Cx" },
  { ...k("^D", "C-d"), tid: "Cd" },
  { ...k("^C", "C-c"), tid: "Cc" },
  { ...k("^L", "C-l"), tid: "Cl" },
  { ...k("^S", "C-s"), tid: "Cs" },
  { ...k("^Z", "C-z"), tid: "Cz" },
];
const FN_KEYS: XKey[] = [
  k("F1", "F1"), k("F2", "F2"), k("F3", "F3"), k("F4", "F4"),
  k("F5", "F5"), k("F6", "F6"), k("F7", "F7"), k("F8", "F8"),
  k("F9", "F9"), k("F10", "F10"), k("F11", "F11"), k("F12", "F12"),
];
const SYM_CHARS = ["|", "\\", "?", "-", ":", ";", "!", "~", "@", "$", "*", "^", "%", "=", "`", "<", ">", "(", ")", "{", "}", "[", "]"];

// (reserva vertical do iframe centralizada em shell-layers.ts → keysReservePx)

// FIX kbicon (23/08): folga para o ícone minimizado pousar ACIMA do Dock —
// valores centralizados em src/lib/shell-layers.ts (fonte única de camadas).

// TESTE B — zoom (fontSize ±) via escala visual do iframe ttyd. O xterm roda
// cross-origin dentro do iframe: não há acesso direto ao fontSize dele, então
// escalamos o próprio iframe com compensação de dimensões — mesmo efeito de
// zoom de terminal real (fonte maior, menos colunas/linhas visíveis).
const FONTSCALE_KEY = "hokma.terminal.fontscale.v1";
const FONTSCALE_MIN = 0.7;
const FONTSCALE_MAX = 1.6;

function readFontScale(): number {
  try {
    const n = Number(localStorage.getItem(FONTSCALE_KEY));
    if (Number.isFinite(n) && n >= FONTSCALE_MIN && n <= FONTSCALE_MAX) return n;
  } catch {
    /* noop */
  }
  return 1;
}

// TESTE C — múltiplas abas: cada aba = sessão tmux própria. O id "ttyd" é a
// sessão legada (hok-ttyd); ids numéricos criam hok-terminal-N via url-arg
// do ttyd (-a) + wrapper systemd tmux-tab.sh.
type TabsState = { ids: string[]; active: string };
const TABS_KEY = "hokma.terminal.tabs.v1";

function loadTabs(): TabsState {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const t = JSON.parse(raw) as TabsState;
      if (Array.isArray(t.ids) && t.ids.length > 0 && t.ids.includes(t.active)) return t;
    }
  } catch {
    /* noop */
  }
  return { ids: ["ttyd"], active: "ttyd" };
}

function sessionNameOf(id: string): string {
  return id === "ttyd" ? "hok-ttyd" : "hok-terminal-" + id;
}

export function TerminalTTYDScreen() {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const aliveRef = useRef(true);
  // FIX reconexão (23/08): URL mais recente do ttyd (token fresco) + nonce
  // que força remontagem do iframe na recuperação, sem tocar em sessão sadia.
  const urlRef = useRef<string | null>(null);
  const committedRef = useRef(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [recovering, setRecovering] = useState(false);
  // FIX refit (23/08): o FitAddon do xterm (dentro do iframe cross-origin)
  // mede as células ANTES da fonte terminal carregar → conta linhas demais →
  // o rodapé do TUI (caixa de digitação + faixa verde do tmux) fica clipado
  // abaixo do visível ("caixa de digitação quase cortada"). Oscilar 2px na
  // reserva dispara window.resize interno do iframe → refit correto.
  const [fitNudgePx, setFitNudgePx] = useState(0);
  // FIX kbfocus (23/08): ao MAXIMIZAR, abrir o teclado do sistema. O iframe é
  // cross-origin (não dá para focar a textarea do xterm diretamente), mas
  // iframe.focus() feito DENTRO do gesto de toque delega o foco ao elemento
  // ativo do iframe (textarea do xterm) e o Chromium abre o IME.
  const iframeElRef = useRef<HTMLIFrameElement | null>(null);
  const focusTerminalInput = useCallback(() => {
    try {
      iframeElRef.current?.focus({ preventScroll: true });
    } catch {
      /* noop */
    }
  }, []);
  const nudgeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scheduleFitNudge = useCallback(() => {
    nudgeTimersRef.current.forEach(clearTimeout);
    nudgeTimersRef.current = [350, 1500].map((delay) =>
      setTimeout(() => {
        setFitNudgePx(2);
        nudgeTimersRef.current.push(
          setTimeout(() => setFitNudgePx(0), 90),
        );
      }, delay),
    );
  }, []);
  const attemptsRef = useRef(0);
  const recoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hiddenAtRef = useRef<number | null>(null);

  const [, forceTick] = useState(0);
  const rerender = useCallback(() => forceTick((n) => n + 1), []);

  // FIX ancoragem ao teclado: o layout viewport NÃO encolhe quando o teclado
  // mobile abre — usamos window.visualViewport (área REALMENTE visível) para
  // reposicionar a barra colada no topo do teclado, subindo/descendo junto.
  const [kbInset, setKbInset] = useState(0);

  // TESTE minimizável estilo Termius: ícone compacto ↔ barra completa.
  // Preferência persistida.
  const [keysExpanded, setKeysExpanded] = useState(() => {
    try {
      return localStorage.getItem("hokma.terminal.keysbar.v1") === "expanded";
    } catch {
      return false;
    }
  });
  const toggleKeysBar = useCallback(() => {
    setKeysExpanded((v) => {
      const nv = !v;
      try {
        localStorage.setItem("hokma.terminal.keysbar.v1", nv ? "expanded" : "min");
      } catch {
        /* noop */
      }
      // MAXIMIZAR: dentro do gesto, delega foco ao terminal → IME abre
      if (nv) focusTerminalInput();
      return nv;
    });
  }, [focusTerminalInput]);
  const [extraGroup, setExtraGroup] = useState(false);
  useEffect(() => () => {
    nudgeTimersRef.current.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      setKbInset(0);
      return;
    }
    const onVV = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0)),
      );
      setKbInset(inset);
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    return () => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
    };
  }, []);

  const fetchToken = useCallback(async (): Promise<number> => {
    const raw = localStorage.getItem("hokma.settings.v1");
    const s = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const server = String(s["Server URL"] ?? "").replace(/\/$/, "");
    const tok = String(s["HOK_TOKEN"] ?? "");
    const res = await fetch(`${server}/terminal/token`, {
      method: "POST",
      headers: { "X-Hok-Token": tok },
    });
    if (!res.ok) throw new Error(`token indisponível (${res.status})`);
    const j = (await res.json()) as { terminal_url?: string; expires_in?: number };
    if (!j.terminal_url) throw new Error("resposta sem terminal_url");
    // FIX reconexão (23/08): renovação SILÊNCIOSA — guarda a URL mais recente
    // em ref (usada ao recarregar o iframe na recuperação, com token fresco),
    // sem remontar o iframe a cada ciclo de ~4min.
    urlRef.current = j.terminal_url;
    if (aliveRef.current && !committedRef.current) {
      committedRef.current = true;
      setUrl(j.terminal_url);
    }
    return typeof j.expires_in === "number" ? j.expires_in : 300;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = async () => {
      try {
        const exp = await fetchToken();
        if (!aliveRef.current) return;
        timer = setTimeout(cycle, Math.max(30, exp - RENEW_MARGIN_S) * 1000);
      } catch (e) {
        if (!aliveRef.current) return;
        setErr(e instanceof Error ? e.message : String(e));
        timer = setTimeout(cycle, RETRY_ERR_MS);
      }
    };
    void cycle();
    return () => {
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [fetchToken]);

  const serverBase = (() => {
    try {
      const raw = localStorage.getItem("hokma.settings.v1");
      const s = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      return String(s["Server URL"] ?? "").replace(/\/$/, "");
    } catch {
      return "";
    }
  })();
  const tokQ = url ? (() => {
    try {
      return new URL(url).searchParams.get("token") ?? "";
    } catch {
      return "";
    }
  })() : "";

  // ── FIX reconexão automática (23/08, item 4) ───────────────────────────
  // O overlay "Press to Reconnect" é INTERNO do iframe cross-origin (inalcançá-
  // vel). Recuperação pelo PAI: sondas de saúde no backend com backoff exponen-
  // tial (1s→10s) e remontagem do iframe (reattach tmux preserva a tela) quando
  // a rede volta. Gatilhos: evento 'online' e retorno de visibilidade (>10s).
  const probeHealth = useCallback(async (): Promise<boolean> => {
    const base = serverBase;
    if (!base) return false;
    try {
      // 200 (válido) ou 401 (expirado mas servidor respondeu) = alcançável.
      const res = await fetch(`${base}/terminal/token/validate?token=${encodeURIComponent(tokQ)}`, {
        method: "GET",
      });
      return res.ok || res.status === 401;
    } catch {
      return false;
    }
  }, [serverBase, tokQ]);

  useEffect(() => {
    if (!recovering) return;
    let cancelled = false;
    const attempt = async () => {
      if (cancelled) return;
      const ok = await probeHealth();
      if (cancelled) return;
      if (ok) {
        attemptsRef.current = 0;
        setReloadNonce((n) => n + 1); // remonta iframe → WS novo → reattach tmux
        return; // chip some no onLoad do iframe
      }
      attemptsRef.current += 1;
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 10_000);
      recoverTimerRef.current = setTimeout(attempt, delay);
    };
    void attempt();
    return () => {
      cancelled = true;
      if (recoverTimerRef.current) clearTimeout(recoverTimerRef.current);
    };
  }, [recovering, probeHealth]);

  useEffect(() => {
    const startRecovery = () => setRecovering(true);
    const onOnline = () => startRecovery();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const gone = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      // Voltou pra visible após >10s em background (app suspenso/rede trocada):
      // recupera. Retornos curtos (troca de aba normal) NÃO recarregam.
      if (gone > 10_000) startRecovery();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // TESTE C — abas com sessões tmux individuais (persistidas)
  const [tabs, setTabs] = useState<TabsState>(loadTabs);
  useEffect(() => {
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    } catch {
      /* noop */
    }
  }, [tabs]);
  const activeId = tabs.active;
  const activeSession = sessionNameOf(activeId);
  const openTab = useCallback(() => {
    setTabs(({ ids }) => {
      let n = 1;
      while (ids.includes(String(n))) n++;
      return { ids: [...ids, String(n)], active: String(n) };
    });
  }, []);
  const closeTab = useCallback(
    (id: string) => {
      // mata a sessão tmux da aba (idempotente no server; best-effort)
      void fetch(`${serverBase}/terminal/ttyd/close?token=${encodeURIComponent(tokQ)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: sessionNameOf(id) }),
      }).catch(() => {});
      setTabs(({ ids, active }) => {
        const next = ids.filter((x) => x !== id);
        if (!next.length) return { ids: ["1"], active: "1" }; // sempre ≥1 aba
        const idx = ids.indexOf(id);
        return { ids: next, active: active === id ? next[Math.max(0, idx - 1)] : active };
      });
    },
    [serverBase, tokQ],
  );

  const sendToKeys = useCallback(
    async (payload: { key?: string; text?: string }) => {
      const qs = new URLSearchParams({ token: tokQ });
      await fetch(`${serverBase}/terminal/ttyd/key?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, session: activeSession }),
      }).catch(() => {});
    },
    [serverBase, tokQ, activeSession],
  );

  const pressXKey = (xk: XKey) => {
    const payload = xk.send();
    void sendToKeys(payload);
    if (payload.key) {
      if (sticky.ctrl || sticky.alt) {
        sticky = { ctrl: false, alt: false };
        rerender();
      }
    }
  };

  const toggleSticky = (mod: "ctrl" | "alt") => {
    sticky = { ...sticky, [mod]: !sticky[mod] } as typeof sticky;
    rerender();
  };

  // TESTE 2 — ciclo de temas aplicado À SESSÃO ttyd viva (OSC 10/11/4)
  const themeKeys = Object.keys(TERMINAL_THEMES);
  const [themeIdx, setThemeIdx] = useState(0);
  const themeName = themeKeys[themeIdx % themeKeys.length] ?? "HOK Dark";

  const hexToOsc = (h: string): string => {
    const s = h.replace("#", "").toLowerCase();
    return s.length === 6
      ? "rgb:" + s.slice(0, 2) + "/" + s.slice(2, 4) + "/" + s.slice(4, 6)
      : "";
  };

  const cycleTheme = useCallback(() => {
    const nextKey = themeKeys[(themeIdx + 1) % themeKeys.length];
    setThemeIdx(themeKeys.indexOf(nextKey));
    try {
      localStorage.setItem("hokma.terminal.theme.v1", nextKey);
    } catch {
      /* noop */
    }
    const th = TERMINAL_THEMES[nextKey]?.theme;
    if (!th || !url || !serverBase) return;
    let tok = "";
    try {
      tok = new URL(url).searchParams.get("token") ?? "";
    } catch {
      tok = "";
    }
    if (!tok) return;
    let osc = "\x1b]11;" + hexToOsc(th.background ?? "") + "\x07";
    osc += "\x1b]10;" + hexToOsc(th.foreground ?? "") + "\x07";
    osc += "\x1b]12;" + hexToOsc(th.cursor ?? "") + "\x07";
    const ansiOrder = [
      "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
      "brightBlack", "brightRed", "brightGreen", "brightYellow",
      "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
    ];
    ansiOrder.forEach((c, i) => {
      osc += "\x1b]4;" + i + ";" + hexToOsc(th[c] ?? "#000000") + "\x07";
    });
    void fetch(serverBase + "/terminal/ttyd/theme?token=" + encodeURIComponent(tok), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ osc, session: activeSession }),
    }).catch(() => {});
  }, [themeIdx, url, serverBase, activeSession]);

  // TESTE B — zoom persistido (escala visual do iframe; 1 = 100%)
  const [fontScale, setFontScale] = useState(readFontScale);
  const applyFontScale = useCallback((next: number) => {
    const v = Math.min(FONTSCALE_MAX, Math.max(FONTSCALE_MIN, Math.round(next * 10) / 10));
    setFontScale(v);
    try {
      localStorage.setItem(FONTSCALE_KEY, String(v));
    } catch {
      /* noop */
    }
  }, []);

  return (
    <div data-term-ui className="flex h-full w-full flex-col bg-[#011627] font-mono text-emerald-400">
      <div className="flex items-center justify-between border-b border-emerald-900/40 px-3 py-2 text-[11px]">
        <span className="text-emerald-300/80">HOK Server · terminal (ttyd)</span>
        <div className="flex items-center gap-2">
          <span className={err ? "text-red-300" : url ? "text-emerald-300" : "text-amber-300"}>
            {err ? "ERRO" : url ? "LIVE" : "Conectando…"}
          </span>
          {/* TESTE B — zoom (fontSize ±) via escala visual do iframe */}
          <button onClick={() => applyFontScale(fontScale - 0.1)}
            title={`Zoom − (${Math.round(fontScale * 100)}%)`}
            data-testid="term-zoom-out"
            className="rounded-md border border-emerald-900/50 bg-emerald-500/5 p-1 text-emerald-300 hover:bg-emerald-500/10">
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[34px] text-center text-[10px] text-emerald-400/70" data-testid="term-zoom-level">
            {Math.round(fontScale * 100)}%
          </span>
          <button onClick={() => applyFontScale(fontScale + 0.1)}
            title={`Zoom + (${Math.round(fontScale * 100)}%)`}
            data-testid="term-zoom-in"
            className="rounded-md border border-emerald-900/50 bg-emerald-500/5 p-1 text-emerald-300 hover:bg-emerald-500/10">
            <Plus className="h-3 w-3" />
          </button>
          {/* TESTE 2 — ciclo de temas aplicado À SESSÃO ttyd viva (OSC) */}
          <button onClick={cycleTheme}
            title={`Tema: ${themeName} (clique para trocar)`}
            data-testid="term-theme"
            className="rounded-md border border-emerald-900/50 bg-emerald-500/5 p-1 text-emerald-300 hover:bg-emerald-500/10">
            <Palette className="h-3 w-3" />
          </button>
        </div>
      </div>
      {/* TESTE C — faixa de abas (uma sessão tmux por aba) */}
      <div
        data-testid="term-tabs"
        className="thin-scroll flex items-center gap-1 overflow-x-auto border-b border-emerald-900/40 px-1 py-1"
        style={{ zIndex: SHELL_Z.terminalTabs }}
      >
        {tabs.ids.map((id) => (
          <div
            key={id}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold",
              id === activeId
                ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                : "border-emerald-900/50 text-emerald-400/70",
            )}
          >
            <button
              type="button"
              onClick={() => setTabs((s) => ({ ...s, active: id }))}
              data-testid={`term-tab-${id}`}
              title={`Sessão tmux ${sessionNameOf(id)}`}
            >
              {id === "ttyd" ? "main" : `t${id}`}
            </button>
            <button
              type="button"
              onClick={() => closeTab(id)}
              data-testid={`term-close-${id}`}
              title="Fechar esta sessão"
              className="text-emerald-600 hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={openTab}
          data-testid="term-tab-new"
          title="Nova aba/sessão de terminal"
          className="shrink-0 rounded-lg border border-emerald-900/50 px-2 py-0.5 text-[12px] font-bold text-emerald-300 hover:bg-emerald-500/10 active:bg-emerald-400 active:text-emerald-950"
        >
          +
        </button>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-black"
        style={{ paddingBottom: keysReservePx(keysExpanded, extraGroup) - fitNudgePx }}
      >
        {recovering && (
          <div
            data-testid="term-recovering"
            className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-[#0b1626]/90 px-2.5 py-1 text-[10px] font-semibold text-amber-300 shadow-lg backdrop-blur-sm"
            style={{ zIndex: SHELL_Z.terminalRecovery }}
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            Reconectando…
          </div>
        )}
        {err ? (
          <div className="p-3 text-[11px] text-red-300">⚠️ {err}</div>
        ) : url ? (
          <iframe
            key={`${url}|${activeId}|${reloadNonce}`}
            ref={iframeElRef}
            src={`${urlRef.current ?? url}&arg=${encodeURIComponent(activeId)}`}
            title="Terminal HOK"
            className="h-full w-full border-0 bg-black"
            onLoad={() => {
              setRecovering(false);
              attemptsRef.current = 0;
              scheduleFitNudge();
            }}
            style={{
              // FIX kbfocus: com teclado do sistema aberto (kbInset), sobe o
              // conteúdo para que o rodapé do TUI (input + faixa verde) fique
              // logo acima da barra de teclas — chat visível de topo a base.
              transform: `translateY(-${Math.max(0, kbInset - 128)}px) scale(${fontScale})`,
              transformOrigin: "top left",
              width: `${100 / fontScale}%`,
              height: `${100 / fontScale}%`,
            }}
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="p-3 text-[11px] text-emerald-300/70">Carregando terminal…</div>
        )}
      </div>
      {/* TESTE 1 v2 — barra de teclas MINIMIZÁVEL estilo Termius:
          ícone compacto ↔ barra completa.
          FIX zfix definitivo (23/08): posicionamento ABSOLUTO ao box da tela
          (imune ao containing-block do motion.div do AppShell) e SEM heurística
          de kbOpen — bottom = max(kbInset, DOCK_CLEAR_PX) em QUALQUER estado
          (teclado aberto/fechado, zoom, tema): sempre acima do Dock. */}
      {!keysExpanded ? (
        <div
          className="absolute left-0 right-0 flex justify-end px-2 transition-[bottom] duration-150"
          style={{ zIndex: SHELL_Z.keysBarMinimized, bottom: aboveDock(kbInset) }}
        >
          <button type="button" data-testid="ov-toggle"
            onClick={toggleKeysBar}
            title="Maximizar: ver chat completo + teclado especial"
            className="relative flex h-10 w-10 select-none items-center justify-center rounded-xl border border-emerald-400/60 bg-[#0b1626]/95 text-emerald-300 shadow-lg active:bg-emerald-400 active:text-emerald-950">
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>
      ) : (
      <div
        data-testid="ov-bar"
        className="absolute left-0 right-0 bg-[#0b1626] px-1 py-1"
        style={{ zIndex: SHELL_Z.keysBarExpanded, bottom: aboveDock(kbInset) }}
      >
        {/* GRUPO EXTRA "..." — Alt, Tab/Space/⌫/⏎, Home/End/PgUp/PgDn/Ins/Del,
            símbolos, F1-F12 e sequências ^W ^R ^X ^D ^C ^L ^S ^Z */}
        <div data-testid="ov-extra-group" className={"thin-scroll mb-1 flex w-max items-center gap-1 overflow-x-auto " + (extraGroup ? "" : "hidden")} style={{ WebkitOverflowScrolling: "touch" }}>
          <button type="button" data-testid="ov-sticky-alt"
            onClick={() => toggleSticky("alt")}
            title="Alt pegajoso (combina com a próxima tecla)"
            className={cn(
              "flex h-9 min-w-[44px] shrink-0 select-none items-center justify-center rounded-lg border px-2 text-[11px] font-semibold",
              sticky.alt
                ? "border-emerald-300 bg-emerald-400/20 text-emerald-200"
                : "border-sky-800/50 bg-sky-500/5 text-sky-300",
            )}>
            Alt
          </button>
          {NAV_EXTRA.map((xk) => (
            <button key={xk.label} type="button" data-testid={`ov-key-${xk.label}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[38px] shrink-0 select-none items-center justify-center rounded-lg border border-emerald-900/50 bg-emerald-500/5 px-2 text-[11px] text-emerald-300 active:bg-emerald-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {EDIT_EXTRA.map((xk) => (
            <button key={xk.label} type="button" data-testid={`ov-key-${xk.label}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[38px] shrink-0 select-none items-center justify-center rounded-lg border border-emerald-900/50 bg-emerald-500/5 px-2 text-[11px] text-emerald-300 active:bg-emerald-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {FN_KEYS.map((xk) => (
            <button key={xk.label} type="button" data-testid={`ov-fn-${xk.label}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[34px] shrink-0 select-none items-center justify-center rounded-lg border border-sky-800/50 bg-sky-500/5 px-1.5 text-[10px] font-mono text-sky-300 active:bg-sky-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {SYM_CHARS.map((s, i) => (
            <button key={`sym-${i}`} type="button" data-testid={`ov-sym-${i}`}
              onClick={() => void sendToKeys({ text: s })}
              className="flex h-9 min-w-[32px] shrink-0 select-none items-center justify-center rounded-lg border border-emerald-900/50 bg-emerald-500/5 px-2 text-[13px] text-emerald-200 active:bg-emerald-400 active:text-emerald-950">
              {s}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {COMBO_KEYS.map((xk) => (
            <button key={xk.tid ?? xk.label} type="button" data-testid={`ov-combo-${xk.tid}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[36px] shrink-0 select-none items-center justify-center rounded-lg border border-red-800/50 bg-red-500/5 px-2 text-[10px] font-mono text-red-300 active:bg-red-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
        </div>
        {/* LINHA SEMPRE VISÍVEL (compacta): Ctrl · Esc · setas · S-Tab · "..." */}
        <div className="thin-scroll flex w-max items-center gap-1 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <button type="button" data-testid="ov-collapse"
            onClick={toggleKeysBar}
            title="Minimizar: voltar ao ícone compacto (terminal ocupa o máximo)"
            className="relative flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-lg border border-red-800/60 bg-red-500/10 text-emerald-300 active:bg-emerald-400 active:text-emerald-950">
            <Minimize2 className="h-4 w-4" />
          </button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          <button type="button" data-testid="ov-sticky-ctrl"
            onClick={() => toggleSticky("ctrl")}
            title="Ctrl pegajoso (combina com a próxima tecla)"
            className={cn(
              "flex h-9 min-w-[44px] shrink-0 select-none items-center justify-center rounded-lg border px-2 text-[11px] font-semibold",
              sticky.ctrl
                ? "border-red-300 bg-red-400/20 text-red-200"
                : "border-red-800/50 bg-red-500/5 text-red-300",
            )}>
            Ctrl
          </button>
          {[k("Esc", "Escape")].map((xk) => (
            <button key={xk.label} type="button" data-testid={`ov-key-${xk.label}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[38px] shrink-0 select-none items-center justify-center rounded-lg border border-emerald-900/50 bg-emerald-500/5 px-2 text-[12px] text-emerald-300 active:bg-emerald-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
          {ROW_KEYS.map((xk) => (
            <button key={xk.tid ?? xk.label} type="button" data-testid={`ov-key-${xk.tid ?? xk.label}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[36px] shrink-0 select-none items-center justify-center rounded-lg border border-emerald-900/50 bg-emerald-500/5 px-1.5 text-[13px] text-emerald-300 active:bg-emerald-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {/* "..." alterna o grupo extra */}
          <button type="button" data-testid="ov-more"
            onClick={() => setExtraGroup((v) => !v)}
            title="Mais teclas (Alt, Tab, Ins/Del, Home/Pg, símbolos, F1-F12, ^combos)"
            className={cn(
              "flex h-9 min-w-[44px] shrink-0 select-none items-center justify-center rounded-lg border px-2 text-[14px] font-bold tracking-widest",
              extraGroup ? "border-emerald-300 bg-emerald-400/20 text-emerald-200" : "border-emerald-900/50 bg-emerald-500/5 text-emerald-300",
            )}>
            ····
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
