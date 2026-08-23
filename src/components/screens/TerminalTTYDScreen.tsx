"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Palette, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { appStore } from "@/lib/app-state";
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
    if (/^(Up|Down|Left|Right|Space|Enter|BSpace|Tab|Delete|Insert)$/.test(name))
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

const NAV_KEYS: XKey[] = [
  k("↑", "Up"), k("↓", "Down"), k("←", "Left"), k("→", "Right"),
  k("Home", "Home"), k("End", "End"),
  k("PgUp", "PageUp"), k("PgDn", "PageDown"),
  k("Ins", "Insert"), k("Del", "Delete"),
];
const COMBO_KEYS: XKey[] = [
  { ...k("^C", "C-c"), tid: "Cc" },
  { ...k("^D", "C-d"), tid: "Cd" },
  { ...k("^W", "C-w"), tid: "Cw" },
  { ...k("^R", "C-r"), tid: "Cr" },
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

const KEYS_BAR_H = 46; // altura da barra de teclas (px) — reserva do iframe

export function TerminalTTYDScreen() {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const [, forceTick] = useState(0);
  const rerender = useCallback(() => forceTick((n) => n + 1), []);

  // FIX ancoragem ao teclado: o layout viewport NÃO encolhe quando o teclado
  // mobile abre — usamos window.visualViewport (área REALMENTE visível) para
  // reposicionar a barra colada no topo do teclado, subindo/descendo junto.
  const [kbInset, setKbInset] = useState(0);

  // TESTE minimizável estilo Termius: ícone compacto ↔ barra completa.
  // Preferência persistida; espelhada em ref para o listener do VV decidir
  // se publica keyboardOpen ao Dock (só esconde Dock com barra EXPANDIDA).
  const [keysExpanded, setKeysExpanded] = useState(() => {
    try {
      return localStorage.getItem("hokma.terminal.keysbar.v1") === "expanded";
    } catch {
      return false;
    }
  });
  const keysExpandedRef = useRef(keysExpanded);
  useEffect(() => {
    keysExpandedRef.current = keysExpanded;
  }, [keysExpanded]);
  const toggleKeysBar = useCallback(() => {
    setKeysExpanded((v) => {
      const nv = !v;
      try {
        localStorage.setItem("hokma.terminal.keysbar.v1", nv ? "expanded" : "min");
      } catch {
        /* noop */
      }
      return nv;
    });
  }, []);
  const [extraGroup, setExtraGroup] = useState(false);
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
      // FIX kbhide refinado: o Dock se oculta apenas com a barra de teclas
      // EXPANDIDA e teclado aberto na tela Terminal. No estado minimizado há
      // espaço livre suficiente para ambos coexistirem.
      try {
        const st = appStore.get();
        if (st.screen === "terminal") {
          appStore.set({ keyboardOpen: inset > 24 && keysExpandedRef.current });
        } else if (inset === 0) {
          appStore.set({ keyboardOpen: false });
        }
      } catch {
        /* noop */
      }
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    return () => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
      try {
        appStore.set({ keyboardOpen: false });
      } catch {
        /* noop */
      }
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
    if (aliveRef.current) setUrl(j.terminal_url);
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

  const sendToKeys = useCallback(
    async (payload: { key?: string; text?: string }) => {
      const qs = new URLSearchParams({ token: tokQ });
      await fetch(`${serverBase}/terminal/ttyd/key?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    [serverBase, tokQ],
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
      body: JSON.stringify({ osc }),
    }).catch(() => {});
  }, [themeIdx, url, serverBase]);

  return (
    <div className="flex h-full w-full flex-col bg-[#011627] font-mono text-emerald-400">
      <div className="flex items-center justify-between border-b border-emerald-900/40 px-3 py-2 text-[11px]">
        <span className="text-emerald-300/80">HOK Server · terminal (ttyd)</span>
        <div className="flex items-center gap-2">
          <span className={err ? "text-red-300" : url ? "text-emerald-300" : "text-amber-300"}>
            {err ? "ERRO" : url ? "LIVE" : "Conectando…"}
          </span>
          {/* TESTE 2 — ciclo de temas aplicado À SESSÃO ttyd viva (OSC) */}
          <button onClick={cycleTheme}
            title={`Tema: ${themeName} (clique para trocar)`}
            data-testid="term-theme"
            className="rounded-md border border-emerald-900/50 bg-emerald-500/5 p-1 text-emerald-300 hover:bg-emerald-500/10">
            <Palette className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1 bg-black"
        style={{ paddingBottom: KEYS_BAR_H }}
      >
        {err ? (
          <div className="p-3 text-[11px] text-red-300">⚠️ {err}</div>
        ) : url ? (
          <iframe
            key={url}
            src={url}
            title="Terminal HOK"
            className="h-full w-full border-0 bg-black"
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="p-3 text-[11px] text-emerald-300/70">Carregando terminal…</div>
        )}
      </div>
      {/* TESTE 1 v2 — barra de teclas MINIMIZÁVEL estilo Termius:
          ícone compacto ↔ barra completa; ancorada ao teclado via kbInset */}
      {!keysExpanded ? (
        <div className="fixed left-0 right-0 z-40 flex justify-end px-2" style={{ bottom: kbInset }}>
          <button type="button" data-testid="ov-toggle"
            onClick={toggleKeysBar}
            title="Abrir teclado especial"
            className="flex h-10 w-10 select-none items-center justify-center rounded-xl border border-emerald-900/60 bg-[#0b1626]/95 text-emerald-300 shadow-lg active:bg-emerald-400 active:text-emerald-950">
            <Keyboard className="h-5 w-5" />
          </button>
        </div>
      ) : (
      <div
        data-testid="ov-bar"
        className="fixed left-0 right-0 z-40 bg-[#0b1626] px-1 py-1"
        style={{ bottom: kbInset }}
      >
        {/* grupo extra "..." — F-keys + símbolos */}
        <div data-testid="ov-extra-group" className={"thin-scroll mb-1 flex w-max items-center gap-1 overflow-x-auto " + (extraGroup ? "" : "hidden")} style={{ WebkitOverflowScrolling: "touch" }}>
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
        </div>
        <div className="thin-scroll flex w-max items-center gap-1 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <button type="button" data-testid="ov-collapse"
            onClick={toggleKeysBar}
            title="Recolher teclado especial"
            className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-lg border border-emerald-300/60 bg-emerald-400/10 text-emerald-300 active:bg-emerald-400 active:text-emerald-950">
            <Keyboard className="h-4 w-4" />
          </button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {NAV_KEYS.map((xk) => (
            <button key={xk.label} type="button" data-testid={`ov-key-${xk.label}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[38px] shrink-0 select-none items-center justify-center rounded-lg border border-emerald-900/50 bg-emerald-500/5 px-2 text-[12px] text-emerald-300 active:bg-emerald-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {[k("Esc", "Escape"), k("Tab", "Tab"), k("Space", "Space"), k("⌫", "BSpace"), k("⏎", "Enter")].map((xk) => (
            <button key={xk.label} type="button" data-testid={`ov-key-${xk.label}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[38px] shrink-0 select-none items-center justify-center rounded-lg border border-emerald-900/50 bg-emerald-500/5 px-2 text-[11px] text-emerald-300 active:bg-emerald-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {COMBO_KEYS.map((xk) => (
            <button key={xk.tid ?? xk.label} type="button" data-testid={`ov-combo-${xk.tid}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[36px] shrink-0 select-none items-center justify-center rounded-lg border border-red-800/50 bg-red-500/5 px-2 text-[10px] font-mono text-red-300 active:bg-red-400 active:text-emerald-950">
              {xk.label}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-emerald-900/40" />
          {/* "..." alterna o grupo extra (F-keys + símbolos) */}
          <button type="button" data-testid="ov-more"
            onClick={() => setExtraGroup((v) => !v)}
            title="Mais teclas (F1-F12 e símbolos)"
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
