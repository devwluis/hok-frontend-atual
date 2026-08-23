"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { TERMINAL_THEMES } from "./SettingsScreen";

const RENEW_MARGIN_S = 60;
const RETRY_ERR_MS = 10_000;

// ── TESTE 1 — teclado estendido sobre ttyd ──────────────────────────────
// As teclas NÃO entram pelo iframe (cross-origin): são injetadas na sessão
// tmux "hok-ttyd" via POST /terminal/ttyd/key (tmux send-keys no backend),
// e o client ttyd anexado exibe em tempo real. Sticky Ctrl/Alt combinam com
// teclas nomeadas ("C-Left", "M-Right"); símbolos vão literais (-l).
type XKey = {
  label: string;
  tid?: string;
  send: () => { key?: string; text?: string };
};

function applyMods(label: string, name: string): { key?: string; text?: string } {
  // mods sticky aplicam-se a teclas nomeadas (nav/fn); demais: literal
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
  send: () => applyMods(label, name),
});

let sticky = { ctrl: false, alt: false }; // espelhado em state p/ visual

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

export function TerminalTTYDScreen() {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const [, forceTick] = useState(0);
  const rerender = useCallback(() => forceTick((n) => n + 1), []);

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

  // TESTE 2 — ciclo de temas aplicado à sessão ttyd viva (OSC 10/11/4 → tmux)
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
    // consome sticky após uso em tecla nomeada
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
      <div className="relative min-h-0 flex-1 bg-black">
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
      {/* TESTE 1 — teclado estendido: injeta teclas via tmux send-keys */}
      <div className="border-t border-emerald-900/40 bg-[#0b1626] px-1 py-1" data-testid="ov-bar">
        <div className="thin-scroll flex w-max items-center gap-1 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <button type="button" data-testid="ov-ctrl"
            onClick={() => toggleSticky("ctrl")}
            className={`flex h-9 min-w-[44px] shrink-0 select-none items-center justify-center rounded-lg border px-2 text-[10px] font-mono ${sticky.ctrl ? "border-emerald-300 bg-emerald-400 font-bold text-emerald-950 ring-2 ring-emerald-300/80" : "border-amber-700/50 bg-amber-500/5 text-amber-300 active:bg-amber-400 active:text-emerald-950"}`}>
            Ctrl
          </button>
          <button type="button" data-testid="ov-alt"
            onClick={() => toggleSticky("alt")}
            className={`flex h-9 min-w-[44px] shrink-0 select-none items-center justify-center rounded-lg border px-2 text-[10px] font-mono ${sticky.alt ? "border-emerald-300 bg-emerald-400 font-bold text-emerald-950 ring-2 ring-emerald-300/80" : "border-amber-700/50 bg-amber-500/5 text-amber-300 active:bg-amber-400 active:text-emerald-950"}`}>
            Alt
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
            <button key={xk.label} type="button" data-testid={`ov-combo-${xk.tid}`} onClick={() => pressXKey(xk)}
              className="flex h-9 min-w-[36px] shrink-0 select-none items-center justify-center rounded-lg border border-red-800/50 bg-red-500/5 px-2 text-[10px] font-mono text-red-300 active:bg-red-400 active:text-emerald-950">
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
        </div>
      </div>
    </div>
  );
}
