"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Plus, Minus, X, Command, MoreHorizontal, Copy, Square, ClipboardCopy, ClipboardPaste, RotateCcw, Search, Monitor } from "lucide-react";
import { SavedSessionsPanel } from "./SavedSessionsPanel";
import { HistorySearch } from "./HistorySearch";
import { cn } from "@/lib/utils";
import { SHELL_Z, aboveDock, keysReservePx, keyboardShiftPx, DOCK_CLEAR_PX } from "@/lib/shell-layers";
import { BUILD_ID } from "@/lib/build-info";
import { TERMINAL_THEMES, readTerminalTheme } from "./SettingsScreen";
import { useTerminal } from "@/hooks/use-terminal";

/* ── KeyButton (mantido idêntico ao validado) ── */
function KeyButton({
  label, active = false, wide = false, onClick, testid,
}: {
  label: React.ReactNode; active?: boolean; wide?: boolean; onClick: () => void; testid?: string;
}) {
  return (
    <button
      type="button" aria-pressed={active} onClick={onClick} data-testid={testid}
      className={`flex h-9 shrink-0 select-none items-center justify-center rounded-lg border px-3 text-[11px] font-semibold tracking-[0.01em] transition-transform duration-150 active:scale-[0.96] ${wide ? "min-w-[82px]" : "min-w-[42px]"}`}
      style={{
        color: active ? "var(--hok-bg)" : "var(--hok-ink)",
        background: active ? "var(--hok-accent)" : "var(--hok-key)",
        borderColor: active ? "var(--hok-accent)" : "var(--hok-line)",
        boxShadow: active ? "0 2px 0 color-mix(in srgb, var(--hok-accent) 56%, #000)" : "0 2px 0 color-mix(in srgb, var(--hok-line) 65%, #000)",
      }}
    >{label}</button>
  );
}

/* ── Layout do teclado (mantido idêntico ao validado) ── */
const VISIBLE_ROW_KEYS: Array<{ label: string; esc: string; tid: string }> = [
  { label: "Ctrl", esc: "\x03", tid: "Ctrl" },
  { label: "Esc", esc: "\x1b", tid: "Esc" },
  { label: "←", esc: "\x1b[D", tid: "Left" },
  { label: "↑", esc: "\x1b[A", tid: "Up" },
  { label: "↓", esc: "\x1b[B", tid: "Down" },
  { label: "→", esc: "\x1b[C", tid: "Right" },
  { label: "⏎", esc: "\r", tid: "Enter" },
];
const PANEL_NAV_KEYS = [
  { label: "Alt", esc: "\x1b", tid: "Alt" },
  { label: "Tab", esc: "\t", tid: "Tab" },
  { label: "Ins", esc: "\x1b[2~", tid: "Ins" },
  { label: "Del", esc: "\x1b[3~", tid: "Del" },
  { label: "Home", esc: "\x1b[H", tid: "Home" },
  { label: "PgUp", esc: "\x1b[5~", tid: "PgUp" },
  { label: "PgDn", esc: "\x1b[6~", tid: "PgDn" },
  { label: "End", esc: "\x1b[F", tid: "End" },
];
const PANEL_SYM_KEYS = ["|", "\\", "?", "-", ":", ";", "!", "~", "@", "$", "*", "^", "%", "=", "`", "<", ">", "(", ")", "{", "}", "[", "]"];
const PANEL_FKEYS = Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, esc: `\x1b[${i + 11}~`, tid: `F${i + 1}` }));
const PANEL_CTRL_KEYS = [
  { label: "^_", esc: "\x1f", tid: "C_" }, { label: "^W", esc: "\x17", tid: "CW" },
  { label: "^R", esc: "\x12", tid: "CR" }, { label: "^XX", esc: "\x18", tid: "CXX" },
  { label: "^C", esc: "\x03", tid: "CC" }, { label: "^L", esc: "\x0c", tid: "CL" },
  { label: "^S", esc: "\x13", tid: "CS" }, { label: "^Z", esc: "\x1a", tid: "CZ" },
  { label: "^X", esc: "\x18", tid: "CX" }, { label: "^G", esc: "\x07", tid: "CG" },
  { label: "^N", esc: "\x0e", tid: "CN" }, { label: "^P", esc: "\x10", tid: "CP" },
];

function readFontScale(): number {
  try { const v = localStorage.getItem("hokma.terminal.fontscale.v1"); return v ? Number(v) || 1 : 1; } catch { return 1; }
}
const FONTSCALE_KEY = "hokma.terminal.fontscale.v1";
const FONTSCALE_MIN = 0.6;
const FONTSCALE_MAX = 2.0;

type TermEntry = { terminal: Terminal; fitAddon: FitAddon; container: HTMLDivElement; unsub: () => void; unsubReset: () => void };

export function TerminalXtermScreen() {
  const termApi = useTerminal();
  const multiTermRef = useRef<Map<string, TermEntry>>(new Map());
  const activeContainerRef = useRef<HTMLDivElement>(null);
  const [recovering, setRecovering] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [toast, setToast] = useState("");
  const [kbInset, setKbInset] = useState(0);
  const [kbInsetSettled, setKbInsetSettled] = useState(0);
  const kbSettleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barH, setBarH] = useState(0);
  const [keysExpanded, setKeysExpanded] = useState(() => {
    try { return localStorage.getItem("hokma.terminal.keysbar.v1") === "expanded"; } catch { return false; }
  });
  const [extraGroup, setExtraGroup] = useState(false);
  const [themeIdx, setThemeIdx] = useState(() => Math.max(0, Object.keys(TERMINAL_THEMES).indexOf(readTerminalTheme())));
  const [fontScale, setFontScale] = useState(readFontScale);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState("");
  const [histOpen, setHistOpen] = useState(false);
  const [histText, setHistText] = useState("");
  const [savedOpen, setSavedOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selMode, setSelMode] = useState(false);
  const [gestureActive, setGestureActive] = useState(false);
  const gestureRef = useRef({ y: 0, active: false, moved: false });
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [ctxTabId, setCtxTabId] = useState<string | null>(null);
  const [renameTabId, setRenameTabId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const [ctrlSticky, setCtrlSticky] = useState(false);
  const [altSticky, setAltSticky] = useState(false);

  const tid = termApi.activeTabId || "ttyd";
  const tidRef = useRef(tid);
  tidRef.current = tid;
  const activeTab = termApi.tabs.find((t) => t.id === tid);
  const tabIdx = termApi.tabs.findIndex((t) => t.id === tid);
  const tabLabel = activeTab?.note || (tabIdx === 0 ? "main" : String(tabIdx));
  const conn = termApi.tabs.find((t) => t.id === tid)?.conn ?? "idle";

  const focusInput = useCallback(() => {
    const entry = multiTermRef.current.get(tidRef.current);
    try { entry?.terminal.textarea?.focus(); } catch { /* noop */ }
  }, []);

  const flashToast = useCallback((msg: string, ms = 2200) => {
    setToast(msg);
    setTimeout(() => setToast(""), ms);
  }, []);

  const applyFontScale = useCallback((next: number) => {
    const v = Math.min(FONTSCALE_MAX, Math.max(FONTSCALE_MIN, Math.round(next * 10) / 10));
    setFontScale(v);
    try { localStorage.setItem(FONTSCALE_KEY, String(v)); } catch {}
  }, []);

  /* ── Sticky modifiers ── */
  const clearSticky = useCallback(() => { setCtrlSticky(false); setAltSticky(false); }, []);
  const handleToggleCtrl = useCallback(() => { setCtrlSticky((v) => !v); setAltSticky(false); }, []);
  const handleToggleAlt = useCallback(() => { setAltSticky((v) => !v); setCtrlSticky(false); }, []);

  const sendKey = useCallback((label: string, rawEsc: string) => {
    let data = rawEsc;
    let consumed = false;
    if (ctrlSticky) {
      const lc = label.toLowerCase();
      if (lc.length === 1 && lc >= "a" && lc <= "z") { data = String.fromCharCode(lc.charCodeAt(0) - 96); consumed = true; }
    }
    if (altSticky && !consumed) { data = "\x1b" + rawEsc; consumed = true; }
    if (consumed) clearSticky();
    termApi.write(tidRef.current, data);
  }, [ctrlSticky, altSticky, clearSticky]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleKeysBar = useCallback(() => {
    setKeysExpanded((v) => {
      const nv = !v;
      try { localStorage.setItem("hokma.terminal.keysbar.v1", nv ? "expanded" : "min"); } catch {}
      if (nv) focusInput();
      return nv;
    });
  }, [focusInput]);

  /* ── Keyboard inset ── */
  useEffect(() => () => { if (kbSettleTimer.current) clearTimeout(kbSettleTimer.current); }, []);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVV = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0)));
      setKbInset(inset);
      if (kbSettleTimer.current) clearTimeout(kbSettleTimer.current);
      kbSettleTimer.current = setTimeout(() => setKbInsetSettled(inset), 140);
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    return () => { vv.removeEventListener("resize", onVV); vv.removeEventListener("scroll", onVV); };
  }, []);

  /* ── Bar height ── */
  useEffect(() => {
    const el = barRef.current;
    if (!el || !keysExpanded) { setBarH(0); return; }
    const update = () => setBarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [keysExpanded, extraGroup]);

  /* ── Context menu click-outside ── */
  useEffect(() => {
    if (!ctxTabId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-testid^="term-tab-ctx-"]') && !target.closest('[data-testid^="ctx-menu-"]') && !target.closest('[data-testid^="rename-input-"]')) {
        setCtxTabId(null);
        setRenameTabId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctxTabId]);

  useEffect(() => { if (renameTabId && renameRef.current) renameRef.current.focus(); }, [renameTabId]);

  /* ── Physical keyboard + sticky modifiers ── */
  useEffect(() => {
    if (!keysExpanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { clearSticky(); return; }
      if (ctrlSticky) {
        const k = e.key.toLowerCase();
        if (k.length === 1 && k >= "a" && k <= "z") {
          e.preventDefault();
          termApi.write(tidRef.current, String.fromCharCode(k.charCodeAt(0) - 96));
          setCtrlSticky(false);
          return;
        }
        const arrowMap: Record<string, string> = {
          arrowleft: "\x1b[1;5D", arrowright: "\x1b[1;5C",
          arrowup: "\x1b[1;5A", arrowdown: "\x1b[1;5B",
        };
        if (arrowMap[e.key.toLowerCase()]) {
          e.preventDefault();
          termApi.write(tidRef.current, arrowMap[e.key.toLowerCase()]);
          setCtrlSticky(false);
          return;
        }
      }
      if (altSticky) {
        e.preventDefault();
        termApi.write(tidRef.current, "\x1b" + e.key);
        setAltSticky(false);
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [keysExpanded, ctrlSticky, altSticky, clearSticky]); // eslint-disable-line react-hooks/exhaustive-deps

  const kbShift = keyboardShiftPx(kbInsetSettled, keysExpanded, barH);

  /* ── Theme ── */
  const themeKeys = Object.keys(TERMINAL_THEMES);
  const cycleTheme = useCallback(() => {
    const nextKey = themeKeys[(themeIdx + 1) % themeKeys.length];
    setThemeIdx(themeKeys.indexOf(nextKey));
    try { localStorage.setItem("hokma.terminal.theme.v1", nextKey); } catch {}
    const entry = multiTermRef.current.get(tidRef.current);
    if (!entry) return;
    const th = TERMINAL_THEMES[nextKey]?.theme;
    if (!th) return;
    entry.terminal.options.theme = { ...th };
  }, [themeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ══════════════════════════════════════════════════════════════════════
   * MOTOR: Map<tabId, {terminal, fitAddon, container}>
   *
   * Regra xterm.js: cada aba tem SUA PRÓPRIA instância de Terminal.
   * Ao trocar de aba, apenas alternamos display:none/block.
   * NUNCA destruímos e recriamos o terminal.
   *
   * fit.fit() chamado APENAS em 3 momentos:
   * 1) Após term.open() (mount inicial da aba)
   * 2) ResizeObserver debounced (resize real do container)
   * 3) Uma vez após restaurar buffer (takeRecentOutput)
   * ══════════════════════════════════════════════════════════════════════ */
  const getOrCreateTerm = useCallback((tabId: string): TermEntry => {
    const existing = multiTermRef.current.get(tabId);
    if (existing) return existing;

    // Cria container DOM para esta aba
    const container = document.createElement("div");
    container.style.cssText = "width:100%;height:100%;position:absolute;top:0;left:0;";
    container.setAttribute("data-term-container", tabId);

    const terminal = new Terminal({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      theme: {
        background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff", selectionBackground: "#264f78",
      },
      cursorBlink: true,
      scrollback: 10000,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Inscreve no output desta sessão
    const unsub = termApi.subscribeOutput(tabId, (text) => {
      try { terminal.write(text); } catch { /* noop */ }
    });
    const unsubReset = termApi.subscribeReset(tabId, () => {
      try { terminal.reset(); } catch { /* noop */ }
    });

    // onData → escreve na sessão correta via tidRef
    terminal.onData((data) => {
      termApi.write(tidRef.current, data);
    });

    const entry: TermEntry = { terminal, fitAddon, container, unsub, unsubReset };
    multiTermRef.current.set(tabId, entry);
    return entry;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount inicial: cria a 1ª aba
  useEffect(() => {
    const host = activeContainerRef.current;
    if (!host || multiTermRef.current.has(tid)) return;

    const entry = getOrCreateTerm(tid);
    host.appendChild(entry.container);

    // Open no DOM + fit.fit() (1ª vez)
    entry.terminal.open(entry.container);
    entry.fitAddon.fit();
    termApi.ensureConnected(tid);

    // Buffer restore (takeRecentOutput)
    const recent = termApi.takeRecentOutput(tid);
    if (recent) {
      try { entry.terminal.write(recent); } catch { /* noop */ }
    }

    // ResizeObserver debounced (2ª vez que fit.fit() pode ser chamado)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) return;
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        try {
          entry.fitAddon.fit();
          const dims = entry.fitAddon.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) {
            termApi.sendResize(tidRef.current, dims.cols, dims.rows);
          }
        } catch { /* noop */ }
      }, 150);
    });
    ro.observe(entry.container);

    // Focus
    try { entry.terminal.textarea?.focus(); } catch { /* noop */ }

    return () => {
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Troca de aba: display none/block + fit + buffer restore ── */
  useEffect(() => {
    multiTermRef.current.forEach((entry, tabId) => {
      if (tabId === tid) {
        entry.container.style.display = "block";
      } else {
        entry.container.style.display = "none";
      }
    });

    // Garante que a aba ativa tem terminal
    const host = activeContainerRef.current;
    if (!host) return;
    const entry = getOrCreateTerm(tid);
    if (!entry.container.parentElement) {
      host.appendChild(entry.container);
    }
    if (!entry.terminal.element) {
      entry.terminal.open(entry.container);
      // fit.fit() (1ª vez desta aba)
      entry.fitAddon.fit();
      termApi.ensureConnected(tid);
    }

    // Buffer restore
    const recent = termApi.takeRecentOutput(tid);
    if (recent) {
      try { entry.terminal.write(recent); } catch { /* noop */ }
    }

    // fit.fit() após restore (3ª vez)
    requestAnimationFrame(() => {
      try { entry.fitAddon.fit(); } catch { /* noop */ }
      try { entry.terminal.textarea?.focus(); } catch { /* noop */ }
    });
  }, [tid]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ══════════════════════════════════════════════════════════════════════
   * Clipboards, gesture, attach (mantidos idênticos ao validado)
   * ══════════════════════════════════════════════════════════════════════ */
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch { return false; }
  };
  const doCopy = async () => {
    const entry = multiTermRef.current.get(tidRef.current);
    const sel = entry?.terminal.getSelection() ?? "";
    if (!sel) { flashToast("nada selecionado", 1500); return; }
    await copyToClipboard(sel);
    flashToast("copiado ✓", 1500);
  };
  const doSelectAll = () => { try { multiTermRef.current.get(tidRef.current)?.terminal.selectAll(); } catch {} };
  const doCopyAll = async () => {
    const entry = multiTermRef.current.get(tidRef.current);
    if (!entry) return;
    const buf = entry.terminal.buffer.active;
    const n = buf.length;
    const parts: string[] = [];
    for (let y = 0; y < n; y++) {
      const line = buf.getLine(y)?.translateToString(true);
      if (line !== undefined) parts.push(line);
    }
    if (!parts.length) { flashToast("nada a copiar", 1500); return; }
    await copyToClipboard(parts.join("\n"));
    flashToast("histórico copiado ✓", 1500);
  };
  const doPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { termApi.write(tidRef.current, text); flashToast("colado ✓", 1200); }
      else flashToast("clipboard vazio", 1500);
    } catch { setPasteDraft(""); setPasteOpen(true); }
  };
  const confirmPaste = useCallback(() => {
    const t = pasteDraft;
    setPasteOpen(false);
    if (!t) return;
    termApi.write(tidRef.current, t + "\n");
    flashToast("colado ✓", 1200);
  }, [pasteDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  const openHistory = useCallback(() => {
    setHistOpen(true);
    const entry = multiTermRef.current.get(tidRef.current);
    if (!entry) { setHistText("(sem buffer)"); return; }
    const buf = entry.terminal.buffer.active;
    const n = buf.length;
    const parts: string[] = [];
    for (let y = 0; y < n; y++) {
      const line = buf.getLine(y)?.translateToString(true);
      if (line !== undefined) parts.push(line);
    }
    setHistText(parts.join("\n"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selectionStart = useCallback(() => { setSelMode(true); flashToast("seleção ativa", 2000); }, [flashToast]);
  const selectionCancel = useCallback(() => { setSelMode(false); try { multiTermRef.current.get(tidRef.current)?.terminal.clearSelection(); } catch {} }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Touch gesture ── */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    gestureRef.current = { y: e.touches[0].clientY, active: true, moved: false };
    setGestureActive(true);
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (!g.active || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - g.y;
    if (Math.abs(dy) < 10) return;
    g.moved = true;
    g.y = e.touches[0].clientY;
    const entry = multiTermRef.current.get(tidRef.current);
    if (!entry) return;
    const lines = Math.max(1, Math.min(4, Math.round(Math.abs(dy) / 12)));
    try { entry.terminal.scrollLines(dy < 0 ? -lines : lines); } catch {}
    e.preventDefault();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (!g.active) return;
    g.active = false;
    setGestureActive(false);
    if (!g.moved) try { multiTermRef.current.get(tidRef.current)?.terminal.scrollToBottom(); } catch {}
    e.preventDefault();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Attach file ── */
  const handleAttachFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      termApi.write(tidRef.current, content + "\n");
      flashToast(`anexo "${file.name}" injetado ✓`, 2200);
    };
    reader.readAsText(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Cleanup all terminals on unmount ── */
  useEffect(() => {
    return () => {
      multiTermRef.current.forEach((entry) => {
        entry.unsub();
        entry.unsubReset();
        entry.terminal.dispose();
      });
      multiTermRef.current.clear();
    };
  }, []);

  /* ── Theme style ── */
  const themeName = themeKeys[themeIdx] ?? "dark";
  const th = TERMINAL_THEMES[themeName]?.theme ?? TERMINAL_THEMES.dark.theme;
  const themeStyle = {
    "--hok-bg": th.background ?? "#0d0d0d", "--hok-panel": th.background ?? "#151515",
    "--hok-raised": "#20201e", "--hok-ink": th.foreground ?? "#f5f5f5",
    "--hok-muted": th.cyan ?? "#9a9388", "--hok-line": "#34302a",
    "--hok-accent": th.cursor ?? "#F59E0B", "--hok-accent-soft": "#68430a",
    "--hok-terminal": th.background ?? "#0d0d0d", "--hok-terminal-ink": th.foreground ?? "#f5f5f5",
    "--hok-terminal-muted": th.cyan ?? "#82796c", "--hok-terminal-line": "#2a261f",
    "--hok-tmux": "#83c889", "--hok-key": "#20201e",
  } as CSSProperties;

  /* ══════════════════════════════════════════════════════════════════════
   * JSX — UI 100% idêntica à validada (botões, teclado, contexto, abas)
   * ══════════════════════════════════════════════════════════════════════ */
  return (
    <div data-term-ui className="flex h-full w-full flex-col bg-[#011627] font-mono text-emerald-400" style={{ ...themeStyle, paddingBottom: kbInsetSettled > 0 ? kbInsetSettled : undefined }}>
      {/* Header */}
      <div data-testid="term-header" className={`flex h-[54px] shrink-0 items-center justify-between border-b px-3 ${maximized ? "hidden" : ""}`}
        style={{ borderColor: "var(--hok-line)", background: "var(--hok-panel)", zIndex: SHELL_Z.terminalHeader }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--hok-accent)", color: "var(--hok-bg)" }}>
            <Command size={16} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold tracking-[0.14em]" style={{ color: "var(--hok-ink)" }}>HOK OS</span>
              <span className="hidden rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] sm:inline" style={{ color: "var(--hok-accent)", borderColor: "var(--hok-accent-soft)" }}>Hokmá ecosystem</span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[9px]" style={{ color: "var(--hok-muted)" }}>
              <span className={conn === "live" ? "text-emerald-400" : conn === "offline" ? "text-red-400" : "text-amber-400"}>● {conn === "live" ? "LIVE" : conn === "offline" ? "OFFLINE" : "conectando…"}</span>
              <span className="shrink-0 font-mono text-[8px] opacity-70" data-testid="term-build">· b.{BUILD_ID.slice(0, 7)}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5" style={{ borderColor: "var(--hok-line)", background: "var(--hok-bg)" }}>
            <button onClick={() => applyFontScale(fontScale - 0.1)} title="Zoom −" data-testid="term-zoom-out" className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10" style={{ color: "var(--hok-ink)" }}>
              <Minus className="h-3 w-3" />
            </button>
            <button onClick={() => applyFontScale(1)} title="Zoom 100%" data-testid="term-zoom-level" className="w-9 text-center font-mono text-[10px] transition-colors hover:text-[var(--hok-accent)]" style={{ color: "var(--hok-muted)" }}>
              {Math.round(fontScale * 100)}%
            </button>
            <button onClick={() => applyFontScale(fontScale + 0.1)} title="Zoom +" data-testid="term-zoom-in" className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10" style={{ color: "var(--hok-ink)" }}>
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button onClick={cycleTheme} title="Tema" data-testid="term-theme" className="flex h-8 items-center gap-1.5 rounded-md border px-2 transition-colors hover:bg-white/10" style={{ borderColor: "var(--hok-line)", color: "var(--hok-ink)" }}>
            <span className="hidden text-[10px] font-semibold sm:inline">{themeName}</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-[10px]" style={{ color: "var(--hok-terminal-muted)" }}>
            {tabLabel} · {conn === "live" ? "anexado" : conn === "offline" ? "offline" : "conectando…"}
          </span>
        </div>
        <div className="thin-scroll ml-1 flex shrink-0 items-center gap-1 overflow-x-auto">
          <button type="button" data-testid="term-copy" onClick={() => void doCopy()} className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold" style={{ color: "var(--hok-terminal-muted)", borderColor: "var(--hok-line)" }}>
            <Copy size={11} /> Copiar
          </button>
          <button type="button" data-testid="term-copy-all" onClick={() => void doCopyAll()} className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold" style={{ color: "var(--hok-terminal-muted)", borderColor: "var(--hok-line)" }}>
            <ClipboardCopy size={11} /> Tudo
          </button>
          <button type="button" data-testid="term-select" onClick={() => void selectionStart()} className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold" style={{ color: "var(--hok-accent)", borderColor: "var(--hok-accent-soft)" }}>
            <Square size={11} /> Selecionar
          </button>
          <button type="button" data-testid="term-paste" onClick={() => void doPaste()} className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold" style={{ color: "var(--hok-accent)", borderColor: "var(--hok-accent-soft)" }}>
            <ClipboardPaste size={12} /> Colar
          </button>
          <button type="button" data-testid="term-history" onClick={() => void openHistory()} className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold" style={{ color: "var(--hok-accent)", borderColor: "var(--hok-accent-soft)" }}>
            <MoreHorizontal size={11} /> Histórico
          </button>
          <button type="button" onClick={() => { setSavedOpen(true); }} title="Sessões salvas" data-testid="term-sessions" className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold" style={{ color: "var(--hok-accent)", borderColor: "var(--hok-accent-soft)" }}>
            <Monitor size={11} /> Sessões
          </button>
          <button type="button" onClick={() => { setSearchOpen(true); }} title="Buscar no histórico" data-testid="term-search" className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold" style={{ color: "var(--hok-accent)", borderColor: "var(--hok-accent-soft)" }}>
            <Search size={11} /> Buscar
          </button>
          <button type="button" onClick={() => setRecovering(true)} title="Reconectar" data-testid="term-reconnect" className="rounded p-1 transition-colors hover:bg-white/10" style={{ color: "var(--hok-terminal-muted)" }}>
            <RotateCcw size={13} />
          </button>
          <button type="button" onClick={() => setMaximized((v) => !v)} title={maximized ? "Sair tela cheia" : "Maximizar"} data-testid="term-maximize" className="rounded p-1 transition-colors hover:bg-white/10" style={{ color: "var(--hok-accent)" }}>
            {maximized ? <Minus size={14} /> : <Plus size={14} />}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 border-b border-emerald-900/30 px-2 pt-1.5" data-testid="term-tabbar"
        style={{ transition: "border-color 150ms ease-in-out" }}>
        {termApi.tabs.map((tab, i) => {
          const isCtx = ctxTabId === tab.id;
          const label = tab.note || (i === 0 ? "main" : String(i));
          return (
            <div key={tab.id} className="flex items-center relative" style={{ transition: "all 150ms ease-in-out" }}>
              <button type="button" onClick={() => termApi.setActiveTab(tab.id)} data-testid={`term-tab-${i + 1}`}
                onDoubleClick={() => { setRenameTabId(tab.id); setRenameVal(tab.note || label); }}
                className={`group flex items-center gap-1 px-2 py-1 text-[11px] transition-all duration-150 ease-in-out rounded-t-md ${tab.id === termApi.activeTabId ? "text-emerald-200 border-b-2 border-emerald-400" : "text-emerald-300/50 hover:text-emerald-300/80 border-b-2 border-transparent hover:border-emerald-900/50"}`}>
                <span className={`h-1 w-1 rounded-full ${tab.conn === "live" ? "bg-emerald-400" : tab.conn === "connecting" ? "bg-amber-400" : "bg-red-400"}`} />
                {label}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setCtxTabId(isCtx ? null : tab.id); setRenameTabId(null); }}
                data-testid={`term-tab-ctx-${i + 1}`}
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-[10px] text-emerald-300/40 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors duration-150"
                aria-label={`Opções da sessão ${label}`}>
                <MoreHorizontal size={12} />
              </button>
              {isCtx && (
                <div className="absolute left-0 top-full mt-0.5 z-50 min-w-[140px] rounded-lg border border-emerald-900/50 bg-[#0b1626] py-1 shadow-xl" data-testid={`ctx-menu-${i + 1}`}>
                  <button type="button" onClick={() => { termApi.duplicateTab(tab.id); setCtxTabId(null); }} className="flex w-full px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 text-left" data-testid="ctx-duplicate">Duplicar</button>
                  <button type="button" onClick={() => { setRenameTabId(tab.id); setRenameVal(tab.note || label); setCtxTabId(null); }} className="flex w-full px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 text-left" data-testid="ctx-rename">Renomear</button>
                  <button type="button" onClick={() => { cycleTheme(); setCtxTabId(null); }} className="flex w-full px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 text-left" data-testid="ctx-theme">Trocar tema</button>
                  <div className="my-1 border-t border-emerald-900/40" />
                  <button type="button" onClick={() => { termApi.removeTab(tab.id); setCtxTabId(null); }} className="flex w-full px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 text-left" data-testid="ctx-close">Fechar</button>
                </div>
              )}
              {renameTabId === tab.id && (
                <div className="absolute left-0 top-full mt-0.5 z-50 min-w-[140px] rounded-lg border border-emerald-900/50 bg-[#0b1626] px-3 py-2 shadow-xl" data-testid={`rename-input-${i + 1}`}>
                  <input ref={renameRef} value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => {
                    if (e.key === "Enter") { termApi.setTabNote(tab.id, renameVal.trim()); setRenameTabId(null); }
                    if (e.key === "Escape") setRenameTabId(null);
                  }} className="w-full rounded-md border bg-black/30 px-2 py-1 text-[11px] font-mono outline-none" style={{ borderColor: "var(--hok-line)", color: "var(--hok-ink)" }} autoFocus />
                </div>
              )}
              {termApi.tabs.length > 1 && (
                <button type="button" onClick={() => termApi.removeTab(tab.id)} data-testid={`term-tab-close-${i + 1}`}
                  className="-ml-1 rounded-full p-0.5 text-[10px] text-emerald-300/50 hover:text-red-300 transition-colors duration-150" aria-label={`Fechar sessão ${i + 1}`}>✕</button>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => termApi.addTab()} data-testid="term-tab-add"
          className="ml-1 rounded-lg border border-emerald-900/50 px-2 py-1 text-[12px] text-emerald-300 hover:bg-emerald-500/10 transition-colors duration-150" title="Nova sessão">+</button>
      </div>

      {/* Terminal area — container único com display switching */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border"
        style={{
          paddingBottom: keysExpanded ? keysReservePx(true, extraGroup, barH) : 0,
          background: "var(--hok-terminal)", borderColor: "var(--hok-terminal-line)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.025)",
        }}>
        {recovering && (
          <div data-testid="term-recovering" className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-[#0b1626]/90 px-2.5 py-1 text-[10px] font-semibold text-amber-300 shadow-lg backdrop-blur-sm" style={{ zIndex: SHELL_Z.terminalRecovery }}>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            Reconectando…
          </div>
        )}
        {/* Host: os containers de cada aba são appended aqui via getOrCreateTerm */}
        <div ref={activeContainerRef} data-testid="term-host" className="h-full w-full" style={{ position: "relative" }} />
        {coarse && (
          <div data-testid="term-gesture" aria-hidden="true"
            className={cn("absolute inset-0 touch-none transition-opacity duration-150", gestureActive ? "opacity-100" : "opacity-0")}
            style={{ zIndex: SHELL_Z.terminalScrollbar - 1, pointerEvents: gestureActive ? "auto" : "none" }}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} />
        )}
        {pasteOpen && (
          <div data-testid="term-paste-modal" className="absolute inset-0 flex items-center justify-center bg-black/60 p-4" style={{ zIndex: SHELL_Z.terminalModal }} onClick={() => setPasteOpen(false)}>
            <div className="w-full max-w-md rounded-xl border p-3" style={{ background: "var(--hok-panel)", borderColor: "var(--hok-line)" }} onClick={(e) => e.stopPropagation()}>
              <p className="mb-1.5 text-[12px] font-bold" style={{ color: "var(--hok-ink)" }}>Colar no terminal</p>
              <textarea autoFocus data-testid="term-paste-input" value={pasteDraft} onChange={(e) => setPasteDraft(e.target.value)} rows={4} placeholder="Cole aqui…" className="w-full resize-none rounded-md border bg-black/30 p-2 font-mono text-[12px] outline-none" style={{ color: "var(--hok-terminal-ink)", borderColor: "var(--hok-line)" }} />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setPasteOpen(false)} className="rounded-md border px-3 py-1.5 text-[11px] font-semibold" style={{ color: "var(--hok-muted)", borderColor: "var(--hok-line)" }}>Cancelar</button>
                <button type="button" data-testid="term-paste-confirm" disabled={!pasteDraft.trim()} onClick={() => void confirmPaste()} className="rounded-md border px-3 py-1.5 text-[11px] font-bold disabled:opacity-40" style={{ color: "var(--hok-bg)", background: "var(--hok-accent)", borderColor: "var(--hok-accent)" }}>Inserir</button>
              </div>
            </div>
          </div>
        )}
        {histOpen && (
          <div data-testid="term-history-modal" className="absolute inset-0 flex flex-col bg-black/70 p-2 sm:p-4" style={{ zIndex: SHELL_Z.terminalModal }} onClick={() => setHistOpen(false)}>
            <div className="flex h-full w-full flex-col rounded-xl border" style={{ background: "var(--hok-panel)", borderColor: "var(--hok-line)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--hok-line)" }}>
                <div>
                  <span className="text-[12px] font-bold" style={{ color: "var(--hok-ink)" }}>Histórico</span>
                  <span className="text-[10px]" style={{ color: "var(--hok-muted)" }}> {histText.split("\n").length} linhas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" data-testid="term-history-copy" onClick={() => void copyToClipboard(histText)} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-bold" style={{ color: "var(--hok-bg)", background: "var(--hok-accent)", borderColor: "var(--hok-accent)" }}><Copy size={11} /> Copiar</button>
                  <button type="button" onClick={() => setHistOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ color: "var(--hok-muted)", borderColor: "var(--hok-line)" }}><X size={13} /></button>
                </div>
              </div>
              <div className="m-0 flex-1 overflow-auto overscroll-contain whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed select-text" style={{ color: "var(--hok-terminal-ink)", background: "rgba(0,0,0,0.35)", WebkitOverflowScrolling: "touch", touchAction: "pan-y", userSelect: "text", WebkitUserSelect: "text" }}>
                {histText || "(vazio)"}
              </div>
            </div>
          </div>
        )}
        {savedOpen && (
          <SavedSessionsPanel onClose={() => setSavedOpen(false)} />
        )}
        {searchOpen && (
          <HistorySearch
            terminal={multiTermRef.current.get(tidRef.current)?.terminal ?? null}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </div>

      {/* Keyboard bar */}
      {!keysExpanded ? (
        <div className="absolute left-0 right-0 flex justify-end px-2 transition-[bottom] duration-150" style={{ zIndex: SHELL_Z.keysBarMinimized, bottom: kbInsetSettled > 0 ? kbInsetSettled + 24 : DOCK_CLEAR_PX }}>
          <button type="button" data-testid="ov-toggle" onClick={toggleKeysBar} title="Maximizar" className="relative flex h-12 w-12 select-none items-center justify-center rounded-2xl border shadow-[0_10px_32px_rgba(0,0,0,.28)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-95" style={{ background: "var(--hok-panel)", borderColor: "var(--hok-accent)", color: "var(--hok-accent)" }}>
            <Plus className="h-5 w-5" strokeWidth={1.8} />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2" style={{ background: "var(--hok-tmux)", borderColor: "var(--hok-bg)" }} />
          </button>
        </div>
      ) : (
        <div ref={barRef} data-testid="ov-bar" className="absolute left-0 right-0 rounded-t-xl border border-b-0 px-2 pb-2 pt-2" style={{ zIndex: SHELL_Z.keysBarExpanded, bottom: aboveDock(kbInsetSettled), background: "color-mix(in srgb, var(--hok-panel) 96%, transparent)", borderColor: "var(--hok-line)", boxShadow: "0 -8px 30px rgba(0,0,0,.16)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-1.5">
            <div className="thin-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
              <button type="button" data-testid="ov-collapse" onClick={toggleKeysBar} title="Minimizar" className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-md border transition-colors hover:bg-white/10" style={{ borderColor: "var(--hok-line)", color: "var(--hok-muted)" }}>
                <Minus className="h-4 w-4" />
              </button>
              {VISIBLE_ROW_KEYS.map((xk) => {
                const isCtrl = xk.tid === "Ctrl";
                return (
                  <KeyButton key={xk.label} label={xk.label} testid={`ov-key-${xk.tid}`}
                    active={isCtrl ? ctrlSticky : false}
                    onClick={isCtrl ? handleToggleCtrl : () => sendKey(xk.label, xk.esc)} />
                );
              })}
              <button type="button" data-testid="ov-attach" onClick={() => document.querySelector<HTMLInputElement>('input[data-testid="ov-attach-input"]')?.click()}
                className="flex h-9 shrink-0 select-none items-center justify-center rounded-lg border px-3 text-[11px] font-semibold transition-transform duration-150 active:scale-[0.96]"
                style={{ color: "var(--hok-ink)", background: "var(--hok-key)", borderColor: "var(--hok-line)", boxShadow: "0 2px 0 color-mix(in srgb, var(--hok-line) 65%, #000)" }}>Anexar</button>
              <input type="file" accept="image/*" data-testid="ov-attach-input" onChange={handleAttachFile} className="hidden" />
            </div>
            <button type="button" data-testid="ov-more" aria-expanded={extraGroup} aria-label="Mais teclas" onClick={() => setExtraGroup((v) => !v)} title="Mais teclas"
              className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-md border transition-colors hover:bg-white/10"
              style={{ borderColor: extraGroup ? "var(--hok-accent)" : "var(--hok-line)", color: extraGroup ? "var(--hok-accent)" : "var(--hok-ink)", background: extraGroup ? "var(--hok-accent-soft)" : "var(--hok-key)" }}>
              <MoreHorizontal size={16} />
            </button>
          </div>
          {extraGroup && (
            <div className="mt-2 flex flex-col gap-2 thin-scroll overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
              <div className="flex items-center gap-1.5">
                {PANEL_NAV_KEYS.map((xk) => (
                  <KeyButton key={xk.label} label={xk.label} testid={`ov-nav-${xk.tid}`}
                    active={xk.tid === "Alt" ? altSticky : false}
                    onClick={xk.tid === "Alt" ? handleToggleAlt : () => sendKey(xk.label, xk.esc)} />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {PANEL_SYM_KEYS.map((s, i) => (
                  <KeyButton key={`sym-${i}`} label={s} testid={`ov-sym-${i}`} onClick={() => sendKey(s, s)} />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {PANEL_FKEYS.map((fk) => (
                  <KeyButton key={fk.label} label={fk.label} testid={`ov-fk-${fk.tid}`} onClick={() => sendKey(fk.label, fk.esc)} />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {PANEL_CTRL_KEYS.map((xk) => (
                  <KeyButton key={xk.label} label={xk.label} wide testid={`ov-ctrl-${xk.tid}`} onClick={() => sendKey(xk.label, xk.esc)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div data-testid="term-toast" className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border px-3 py-1 text-[11px] font-bold shadow-lg backdrop-blur-sm" style={{ zIndex: SHELL_Z.terminalRecovery, color: "var(--hok-accent)", borderColor: "var(--hok-accent-soft)", background: "color-mix(in srgb, var(--hok-panel) 92%, transparent)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
