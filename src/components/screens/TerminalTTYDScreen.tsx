"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Palette, Keyboard, Plus, Minus, X, Maximize2, Minimize2, Command, MoreHorizontal, Activity, Circle, RotateCcw, Copy, Square, ClipboardCopy, ClipboardPaste, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHELL_Z, aboveDock, keysReservePx, keyboardShiftPx, DOCK_CLEAR_PX } from "@/lib/shell-layers";
import { TERMINAL_THEMES, readTerminalTheme } from "./SettingsScreen";

const RENEW_MARGIN_S = 60;
const RETRY_ERR_MS = 10_000;

// PARTE 4 — KeyButton do redesign (estética 3D, cores via CSS vars --hok-*).
// Mesmo transporte de sempre: onClick → POST /terminal/ttyd/key.
function KeyButton({
  label,
  active = false,
  wide = false,
  onClick,
  testid,
}: {
  label: React.ReactNode;
  active?: boolean;
  wide?: boolean;
  onClick: () => void;
  testid?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testid}
      className={`flex h-9 shrink-0 select-none items-center justify-center rounded-md border px-3 text-[11px] font-semibold tracking-[0.01em] transition-transform duration-150 active:scale-[0.96] ${
        wide ? "min-w-[82px]" : "min-w-[42px]"
      }`}
      style={{
        color: active ? "var(--hok-bg)" : "var(--hok-ink)",
        background: active ? "var(--hok-accent)" : "var(--hok-key)",
        borderColor: active ? "var(--hok-accent)" : "var(--hok-line)",
        boxShadow: active
          ? "0 2px 0 color-mix(in srgb, var(--hok-accent) 56%, #000)"
          : "0 2px 0 color-mix(in srgb, var(--hok-line) 65%, #000)",
      }}
    >
      {label}
    </button>
  );
}

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

// FIX clipboard v2 (24/08): navigator.clipboard NÃO existe em contexto não
// seguro (http://ip-LAN, alguns WebViews/PWA) — as rodadas anteriores falhavam
// aí em silêncio ("nada acontece"). Fallback universal: textarea invisível +
// document.execCommand("copy"), suportado em todo Chromium mobile.
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* cai no fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-999px;left:-999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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
	const [tokenEpoch, setTokenEpoch] = useState(0);

  const [recovering, setRecovering] = useState(false);
  // PARTE 6 — modo maximizado: colapsa o chrome LOCAL do terminal (header +
  // abas) para dar máxima altura à conversa. SEM fixed inset-0 (decisão da
  // Parte 1): o Dock real do app permanece navegável.
  const [maximized, setMaximized] = useState(false);
  const [toast, setToast] = useState("");
  const startRecovery = useCallback(() => setRecovering(true), []);
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
  // FIX tremor v2 (24/08): UM único nudge por carga do iframe (o FitAddon
  // mede antes da fonte carregar). As rodadas anteriores disparavam DOIS
  // tremores artificiais de 2px (350ms + 1500ms) e repetiam tudo a cada
  // mudança do teclado — somado ao kbInset bruto no iframe, isso ERA o
  // tremor relatado. Nudge único, só no onLoad.
  const scheduleFitNudge = useCallback(() => {
    nudgeTimersRef.current.forEach(clearTimeout);
    nudgeTimersRef.current = [
      setTimeout(() => {
        setFitNudgePx(2);
        nudgeTimersRef.current.push(
          setTimeout(() => setFitNudgePx(0), 90),
        );
      }, 350),
    ];
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
  const [kbInsetSettled, setKbInsetSettled] = useState(0);
  const kbSettleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (kbSettleTimer.current) clearTimeout(kbSettleTimer.current); }, []);

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
    if (sbFlashTimer.current) clearTimeout(sbFlashTimer.current); // REVIEW FIX: sem timer órfão
  }, []);
  // FIX medição (23/08): altura REAL da barra expandida via ResizeObserver →
  // reserva e deslocamento exatos (fim do estimate drift que cortava a
  // faixa verde com o grupo "..." aberto).
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el || !keysExpanded) {
      setBarH(0);
      return;
    }
    const update = () => setBarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [keysExpanded, extraGroup]);
  // Encolhimento do iframe com teclado aberto — fórmula centralizada em
  // shell-layers.ts (keyboardShiftPx): expandida → rodapé acima da barra;
  // minimizada → faixa verde COLADA ao topo do teclado (zero vão).
  // FIX tremor v2 (24/08, causa raiz): usa kbInsetSettled (debounce 140ms),
  // NUNCA o kbInset bruto. O bruto muda a cada frame da animação do teclado
  // (~30–60 eventos resize/scroll); com transition no iframe isso virava uma
  // perseguição contínua = o "tremor" relatado. O valor settled muda UMA vez,
  // ao final da animação. O inset BRUTO continua alimentando só os elementos
  // FLUTUANTES (ícone/barra), que devem colar no topo do teclado ao vivo.
  const kbShift = keyboardShiftPx(kbInsetSettled, keysExpanded, barH);

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
      if (kbSettleTimer.current) clearTimeout(kbSettleTimer.current);
      kbSettleTimer.current = setTimeout(() => setKbInsetSettled(inset), 140);
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
  const tokQ = (() => {
    const src = urlRef.current ?? url;
    if (!src) return "";
    try {
      return new URL(src).searchParams.get("token") ?? "";
    } catch {
      return "";
    }
  })();

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
  }, [startRecovery]);

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
  // PONTE CHAT→TTYD (23/08): registra a sessão VISÍVEL ativa no backend —
  // comandos /terminal do chat passam a injetar nesta sessão (key injection).
  useEffect(() => {
    if (!tokQ) return;
    void fetch(`${serverBase}/terminal/ttyd/active?token=${encodeURIComponent(tokQ)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: activeSession }),
    }).catch(() => {});
  }, [serverBase, tokQ, activeSession]);
	// TESTE E — seleção via tmux copy-mode: start → setas extendem (highlight
	// visível) → copy (buffer tmux → clipboard) ou cancel.
	const [selMode, setSelMode] = useState(false);
	const [selBusy, setSelBusy] = useState(false);
	// FIX clipboard v2 (24/08): modal de colar — se o clipboard do sistema
	// não puder ser LIDO (permissão/contexto), o usuário cola manualmente no
	// campo (long-press nativo SEMPRE funciona) e o texto é injetado na sessão.
	const [pasteOpen, setPasteOpen] = useState(false);
	const [pasteDraft, setPasteDraft] = useState("");
	const selApi = useCallback(
		async (action: string, text?: string): Promise<{ text?: string } | null> => {
			try {
				const res = await fetch(`${serverBase}/terminal/ttyd/selection?token=${encodeURIComponent(tokQ)}`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ session: activeSession, action, text }),
				});
				if (!res.ok) return null;
				return await res.json();
			} catch {
				return null;
			}
		},
		[serverBase, tokQ, activeSession],
	);
	const flashToast = useCallback((msg: string, ms = 2200) => {
		setToast(msg);
		setTimeout(() => setToast(""), ms);
	}, []);
	const copyAll = useCallback(async () => {
		setSelBusy(true);
		const res = await selApi("all");
		setSelBusy(false);
		if (res?.text !== undefined && res.text.trim() !== "") {
			const ok = await writeClipboard(res.text);
			flashToast(ok ? "histórico copiado ✓" : "falha ao acessar a área de transferência");
		} else {
			flashToast("nada a copiar", 1500);
		}
	}, [selApi, flashToast]);
	const copyScreen = useCallback(async () => {
		setSelBusy(true);
		const res = await selApi("screen");
		setSelBusy(false);
		if (res?.text !== undefined && res.text.trim() !== "") {
			const ok = await writeClipboard(res.text);
			flashToast(ok ? "tela copiada ✓" : "falha ao acessar a área de transferência");
		} else {
			flashToast("nada a copiar", 1500);
		}
	}, [selApi, flashToast]);
	const pasteText = useCallback(async () => {
		try {
			if (!navigator.clipboard?.readText) throw new Error("sem API");
			const t = await navigator.clipboard.readText();
			if (!t) { flashToast("clipboard vazio", 1500); return; }
			await selApi("paste", t);
			flashToast("colado ✓", 1200);
		} catch {
			// Sem permissão de LEITURA (comum em http:// e WebView): abre o
			// modal de colagem manual — long-press nativo no campo.
			setPasteDraft("");
			setPasteOpen(true);
		}
	}, [selApi, flashToast]);
	const confirmPasteModal = useCallback(async () => {
		const t = pasteDraft;
		setPasteOpen(false);
		if (!t) return;
		await selApi("paste", t);
		flashToast("colado ✓", 1200);
	}, [pasteDraft, selApi, flashToast]);
	const selectionStart = useCallback(async () => {
		setSelBusy(true);
		const ok = await selApi("start");
		setSelBusy(false);
		if (ok) {
			setSelMode(true);
			flashToast("seleção iniciada: ←↑↓→ estendem · ⏎ copia", 3200);
		} else {
			flashToast("não entrou em modo de seleção");
		}
	}, [selApi, flashToast]);
	const selectionCopy = useCallback(async () => {
		setSelBusy(true);
		const res = await selApi("copy");
		setSelBusy(false);
		setSelMode(false);
		if (res?.text !== undefined && res.text !== "") {
			const ok = await writeClipboard(res.text);
			flashToast(ok ? "seleção copiada ✓" : "falha ao acessar a área de transferência");
		} else {
			flashToast("seleção vazia — use as setas antes de copiar", 2600);
		}
	}, [selApi, flashToast]);
	const selectionCancel = useCallback(async () => {
		setSelMode(false);
		await selApi("cancel");
	}, [selApi]);
  const openTab = useCallback(() => {
    setTabs(({ ids }) => {
      let n = 1;
      while (ids.includes(String(n))) n++;
      return { ids: [...ids, String(n)], active: String(n) };
    });
  }, []);
  const detachTab = useCallback(
    (id: string) => {
      // BUG3 (25/08): "sair sem encerrar" — ação explícita e separada: só
      // remove a aba da visualização; a sessão tmux continua no servidor.
      setTabs(({ ids, active }) => {
        const next = ids.filter((x) => x !== id);
        if (!next.length) return { ids: ["ttyd"], active: "ttyd" }; // fallback neutro (não anexa sessão de terceiros)
        const idx = ids.indexOf(id);
        return { ids: next, active: active === id ? next[Math.max(0, idx - 1)] : active };
      });
    },
    [],
  );
  const closeTab = useCallback(
    (id: string) => {
      // BUG3 (25/08): X = ENCERRAR a sessão de verdade em TODAS as abas
      // (comportamento unificado, com confirmação pelo risco de encerrar
      // sessão alheia por engano — caso CRM). "Sair sem encerrar" é o botão
      // ⤴ separado (detachTab).
      const name = sessionNameOf(id);
      if (!window.confirm(`Fechar a aba ${name} e ENCERRAR a sessão? Isso MATA o processo em execução nela (irreversível).`)) return;
      void fetch(`${serverBase}/terminal/ttyd/close?token=${encodeURIComponent(tokQ)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: name }),
      }).catch(() => {});
      detachTab(id);
    },
    [serverBase, tokQ, detachTab],
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
    // Modo seleção: ⏎ confirma a cópia (atalho Termius-like), não digita.
    if (selMode && payload.key === "Enter") {
      void selectionCopy();
      return;
    }
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
  const [themeIdx, setThemeIdx] = useState(() =>
    Math.max(0, themeKeys.indexOf(readTerminalTheme())),
  );
  // PARTE 3 — paletas da CASCA (hex exatos do mockup redesign) como CSS
  // variables; o xterm continua colorido via OSC (TERMINAL_THEMES), os dois
  // sincronizados pelo mesmo índice de paleta.
  const PALETTES: Record<string, Record<string, string>> = {
    "HOK Dark": {
      bg: "#0d0d0d", panel: "#151515", panelRaised: "#20201e", ink: "#f5f5f5",
      muted: "#9a9388", line: "#34302a", accent: "#F59E0B", accentSoft: "#68430a",
      terminal: "#0d0d0d", terminalInk: "#f5f5f5", terminalMuted: "#82796c",
      terminalLine: "#2a261f", tmux: "#83c889", key: "#20201e",
    },
    "Termius-like": {
      bg: "#011627", panel: "#0a2233", panelRaised: "#12344a", ink: "#e8f1f2",
      muted: "#8ca6ad", line: "#294b5c", accent: "#7fdbca", accentSoft: "#245b65",
      terminal: "#01111f", terminalInk: "#d6e7e9", terminalMuted: "#6f929d",
      terminalLine: "#17384a", tmux: "#9fe3b1", key: "#12344a",
    },
    "High Contrast": {
      bg: "#121313", panel: "#1d1f1e", panelRaised: "#2a2d2a", ink: "#fbf9ed",
      muted: "#b7bbad", line: "#4c534b", accent: "#f2c46d", accentSoft: "#67502c",
      terminal: "#080b0a", terminalInk: "#f5f7dd", terminalMuted: "#a5b39d",
      terminalLine: "#445047", tmux: "#b9ee8e", key: "#2a2d2a",
    },
  };
  const PALETTE_LABELS: Record<string, string> = {
    dark: "HOK Dark",
    termius: "Termius-like",
    highcontrast: "High Contrast",
  };
  const themeName = PALETTE_LABELS[themeKeys[themeIdx % themeKeys.length] ?? "dark"] ?? "HOK Dark";
  const palette = PALETTES[themeName] ?? PALETTES["HOK Dark"];
  const themeStyle = {
    "--hok-bg": palette.bg,
    "--hok-panel": palette.panel,
    "--hok-raised": palette.panelRaised,
    "--hok-ink": palette.ink,
    "--hok-muted": palette.muted,
    "--hok-line": palette.line,
    "--hok-accent": palette.accent,
    "--hok-accent-soft": palette.accentSoft,
    "--hok-terminal": palette.terminal,
    "--hok-terminal-ink": palette.terminalInk,
    "--hok-terminal-muted": palette.terminalMuted,
    "--hok-terminal-line": palette.terminalLine,
    "--hok-tmux": palette.tmux,
    "--hok-key": palette.key,
  } as CSSProperties;

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

  // ── SCROLL FIX 2 — scrollbar do scrollback (dirigida por tmux copy-mode) ──
  // O buffer vive dentro do iframe cross-origin: o indicador é um overlay
  // nosso que comanda o tmux (posição REAL via #{scroll_position}/#{history_size}).
  // SUTIL/TRANSITÓRIO: só aparece durante o gesto/arrasto (flash 0,9s).
  // Em apps TUI (alternate screen) history=0 → inexistente.
  const [sb, setSb] = useState({ ratio: 1, dragging: false, history: 0 });
  const sbTrackRef = useRef<HTMLDivElement | null>(null);
  const sbLastSent = useRef(0);
  const sbDragHist = useRef(0);
  const sbEnteredRef = useRef(false);
  const sbDraggingRef = useRef(false);
  // SCROLL FIX 2 (25/08): indicador SUTIL da scrollbar — só aparece DURANTE o
  // gesto (padrão iOS/Android) e some sozinho. Nada de barra fixa na tela.
  const [sbFlash, setSbFlash] = useState(false);
  const sbFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashSb = useCallback(() => {
    setSbFlash(true);
    if (sbFlashTimer.current) clearTimeout(sbFlashTimer.current);
    sbFlashTimer.current = setTimeout(() => setSbFlash(false), 900);
  }, []);
  // SCROLL FIX 2 (25/08): gesto de TOQUE real no mobile. O iframe é cross-origin
  // (touch nunca chega ao pai e xterm.js não converte touch em mouse report),
  // então uma camada transparente sobre o terminal captura o swipe e traduz
  // em copy-mode (up/down) — conteúdo segue o dedo. Tap curto = volta ao vivo
  // (sai do copy-mode) + foca o iframe (abre o teclado, mesmo mecanismo do
  // maximizar). Ativa só em ponteiro COARSE (mobile) e quando há histórico
  // (TUI/alt-screen history=0 → camada inexistente, app TUI recebe o toque).
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const gestureRef = useRef({ y: 0, t0: 0, active: false, moved: false });
  const gestureAccRef = useRef(0);
  const gesturePosRef = useRef(0); // posição estimada no histórico (goto absoluto)
  const gestureLastSentRef = useRef(0);
  const sbHistoryRef = useRef(0); // espelho do history p/ clamp do gesto

  const sbApi = useCallback(
    async (action: string, amount?: number): Promise<{ history: number; height: number; pos: number } | null> => {
      try {
        const res = await fetch(`${serverBase}/terminal/ttyd/scroll?token=${encodeURIComponent(tokQ)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: activeSession, action, amount }),
        });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    [serverBase, tokQ, activeSession],
  );

  // SCROLL FIX (25/08): sonda periódica do histórico REAL do tmux. A barra é
  // SEMPRE visível quando history > 5 (em TUI/alternate screen history=0 →
  // oculta, como antes) — o buffer do xterm do iframe nunca acumula
  // scrollback real (o histórico vive DENTRO do tmux; wheel/swipe local rolam
  // um buffer quase vazio), então a barra é o afixo de navegação primário no
  // mobile (touch não vira mouse report). O thumb acompanha a posição real do
  // copy-mode — rolar com a roda (mouse on no tmux) move a barra junto.
  const sbInfoRef = useRef(sbApi);
  sbInfoRef.current = sbApi;
  useEffect(() => {
    if (!tokQ) return;
    let alive = true;
    const probe = async () => {
      if (sbDraggingRef.current || document.hidden) return;
      const info = await sbInfoRef.current("info");
      if (!alive || !info) return;
      setSb((s) => ({
        ...s,
        history: info.history,
        ratio:
          info.pos >= 0 && info.history > 0
            ? Math.min(1, Math.max(0, 1 - info.pos / info.history))
            : 1,
      }));
      // ressincroniza a posição estimada do gesto com a real do tmux
      if (!sbDraggingRef.current) {
        sbHistoryRef.current = info.history;
        gesturePosRef.current = info.pos >= 0 ? info.pos : 0;
      }
    };
    void probe();
    const t = setInterval(probe, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tokQ]);

  // REVIEW FIX (25/08): trocar de aba = sessão tmux diferente — o estado de
  // copy-mode (flag, posição estimada, enter em voo) não carrega entre sessões.
  useEffect(() => {
    sbEnteredRef.current = false;
    enterPromiseRef.current = null;
    gesturePosRef.current = 0;
  }, [activeSession]);

  // ── SCROLL FIX 2 — handlers do gesto de toque (mobile) ──
  // ── REVIEW FIX (25/08): enter de copy-mode SINGLE-FLIGHT — evita corrida de
  // múltiplos `tmux copy-mode` concorrentes (cada re-entry resetava a posição
  // no meio do gesto, causando jitter). Todas as origens (gesto, arrasto da
  // barra) compartilham a mesma promessa.
  const enterPromiseRef = useRef<Promise<void> | null>(null);
  const ensureCopyMode = useCallback(async () => {
    if (sbEnteredRef.current) return;
    if (!enterPromiseRef.current) {
      enterPromiseRef.current = (async () => {
        await sbApi("enter");
        sbEnteredRef.current = true;
        // o tmux precisa de um instante para entrar em copy-mode — um -X
        // imediato corre risco de "not in a mode" (observado em produção).
        await new Promise((r) => setTimeout(r, 140));
      })().finally(() => { enterPromiseRef.current = null; });
    }
    await enterPromiseRef.current;
  }, [sbApi]);
  const onGestureStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    gestureRef.current = { y: e.touches[0].clientY, t0: Date.now(), active: true, moved: false };
    gestureAccRef.current = 0;
  }, []);
  const onGestureMove = useCallback(
    (e: React.TouchEvent) => {
      const g = gestureRef.current;
      if (!g.active || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const dy = y - g.y;
      if (Math.abs(dy) < 5) return;
      g.moved = true;
      g.y = y;
      gestureAccRef.current += dy;
      if (Math.abs(gestureAccRef.current) < 14) return;
      // REVIEW FIX (25/08): throttle ANTES de consumir o acumulador — quando
      // throttled, o acc é PRESERVADO e o próximo envio leva o total (antes,
      // o acc era zerado e o envio descartado: movimento se perdia).
      const now = Date.now();
      if (now - gestureLastSentRef.current < 90) return;
      // conteúdo segue o dedo: arrastar p/ BAIXO revela histórico mais antigo
      const lines = Math.max(1, Math.min(8, Math.round(Math.abs(gestureAccRef.current) / 12)));
      const dir = gestureAccRef.current > 0 ? 1 : -1;
      gestureAccRef.current = 0;
      gestureLastSentRef.current = now;
      flashSb();
      // SCROLL FIX 2b (25/08): usa GOTO absoluto em vez de up/down — o backend
      // manda `send-keys -X scroll-up <n>` (contagem posicional), forma que o
      // tmux ignora silenciosamente (up/down testados: ok:true, pos não muda).
      // goto-line <n> funciona e é auto-corretivo. Posição estimada localmente,
      // ressincronizada pela sonda de 2,5s.
      void (async () => {
        await ensureCopyMode();
        const hist = Math.max(1, sbHistoryRef.current);
        gesturePosRef.current = Math.min(hist, Math.max(0, gesturePosRef.current + dir * lines));
        const r = await sbApi("goto", gesturePosRef.current);
        // REVIEW FIX (25/08): auto-cura — se o copy-mode saiu por fora (digitar
        // no teclado/barra sai do copy-mode e a flag ficava stale), o goto
        // falha; reentra UMA vez e reaplica o mesmo destino.
        if (r === null) {
          sbEnteredRef.current = false;
          await ensureCopyMode();
          await sbApi("goto", gesturePosRef.current);
        }
      })();
    },
    [sbApi, flashSb, ensureCopyMode],
  );
  const onGestureEnd = useCallback(
    (e: React.TouchEvent) => {
      const g = gestureRef.current;
      if (!g.active) return;
      g.active = false;
      // KBFIX (25/08): o tap num elemento não-editável (overlay) faz o Chrome
      // despachar mouse/click sintético que rouba o foco do iframe → teclado
      // fecha durante a digitação. preventDefault no touchend (não-passivo no
      // React) cancela o sintético; o refocus defensivo reforça o foco.
      e.preventDefault();
      if (!g.moved && Date.now() - g.t0 < 400) {
        // tap: volta ao vivo (sai do copy-mode) + foca o iframe → teclado abre
        void (async () => {
          await sbApi("bottom");
          sbEnteredRef.current = false;
          gesturePosRef.current = 0;
        })();
        focusTerminalInput();
        // refocus defensivo: vence qualquer roubo de foco assíncrono
        setTimeout(() => focusTerminalInput(), 60);
      }
    },
    [sbApi, focusTerminalInput],
  );

  const sbScrollTo = useCallback(
    async (ratio: number) => {
      const clamped = Math.min(1, Math.max(0, ratio));
      setSb((s) => ({ ...s, ratio: clamped }));
      const now = Date.now();
      if (now - sbLastSent.current < 110) return; // throttle: ≤ ~9 cmd/s
      sbLastSent.current = now;
      if (clamped >= 0.97) {
        await sbApi("top");
        gesturePosRef.current = 0;
        return;
      }
      if (clamped <= 0.03) {
        await sbApi("bottom"); // exit copy-mode → volta ao vivo
        sbEnteredRef.current = false;
        gesturePosRef.current = 0;
        return;
      }
      await ensureCopyMode();
      gesturePosRef.current = Math.round((1 - clamped) * sbDragHist.current);
      const r = await sbApi("goto", gesturePosRef.current);
      // REVIEW FIX: mesma auto-cura do gesto (copy-mode saiu por fora)
      if (r === null) {
        sbEnteredRef.current = false;
        await ensureCopyMode();
        await sbApi("goto", gesturePosRef.current);
      }
    },
    [sbApi, ensureCopyMode],
  );

  const sbOnPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      sbDraggingRef.current = true;
      void (async () => {
        const info = await sbApi("info");
        const hist = info?.history ?? 0;
        if (hist < 5) return; // TUI/alternate screen: nada a rolar
        sbDragHist.current = hist;
        sbEnteredRef.current = false;
        gesturePosRef.current = 0;
        setSb((s) => ({ ...s, dragging: true, history: hist }));
        const rect = sbTrackRef.current?.getBoundingClientRect();
        if (rect) void sbScrollTo(1 - (e.clientY - rect.top) / rect.height);
      })();
    },
    [sbApi, sbScrollTo],
  );

  const sbOnPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!sb.dragging) return;
      const rect = sbTrackRef.current?.getBoundingClientRect();
      if (rect) void sbScrollTo(1 - (e.clientY - rect.top) / rect.height);
    },
    [sb.dragging, sbScrollTo],
  );

  const sbOnPointerUp = useCallback(() => {
    sbDraggingRef.current = false;
    setSb((s) => ({ ...s, dragging: false }));
    void (async () => {
      const info = await sbApi("info");
      if (info && info.pos >= 0 && info.history > 0) {
        setSb((s) => ({ ...s, ratio: 1 - info.pos / info.history }));
      }
    })();
  }, [sbApi]);

  const sbThumbH = 48;

  // FIX follow (23/08): com o teclado aberto, volta ao vivo (sai de
  // copy-mode) para a caixa de digitação ficar visível. FIX tremor v2:
  // SEM scheduleFitNudge aqui — com o valor settled este efeito roda UMA
  // vez por abertura/fechamento; o resize real do iframe já dispara o refit
  // interno do xterm. Repetir o nudge dobrava o tremor.
  const prevShiftRef = useRef(0);
  useEffect(() => {
    if (kbShift === prevShiftRef.current) return;
    const opened = kbShift > 0;
    prevShiftRef.current = kbShift;
    if (opened) void sbApi("bottom");
  }, [kbShift, sbApi]);

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
    <div data-term-ui className="flex h-full w-full flex-col bg-[#011627] font-mono text-emerald-400" style={themeStyle}>
      {/* PARTE 3 — header do redesign: logo + badge, zoom c/ reset, paleta */}
      <div
        data-testid="term-header"
        className={`flex h-[54px] shrink-0 items-center justify-between border-b px-3 ${maximized ? "hidden" : ""}`}
        style={{ borderColor: "var(--hok-line)", background: "var(--hok-panel)", zIndex: SHELL_Z.terminalHeader }}
      >
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
              <span className={err ? "text-red-400" : url ? "text-emerald-400" : "text-amber-400"}>● {err ? "ERRO" : url ? "LIVE" : "conectando…"}</span>
              <span className="truncate">· {tabs.ids.length} sess{tabs.ids.length > 1 ? "ões" : "ão"}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5" style={{ borderColor: "var(--hok-line)", background: "var(--hok-bg)" }}>
            <button onClick={() => applyFontScale(fontScale - 0.1)}
              title={`Zoom − (${Math.round(fontScale * 100)}%)`}
              data-testid="term-zoom-out"
              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10"
              style={{ color: "var(--hok-ink)" }}>
              <Minus className="h-3 w-3" />
            </button>
            <button onClick={() => applyFontScale(1)}
              title="Resetar zoom para 100%"
              data-testid="term-zoom-level"
              className="w-9 text-center font-mono text-[10px] transition-colors hover:text-[var(--hok-accent)]"
              style={{ color: "var(--hok-muted)" }}>
              {Math.round(fontScale * 100)}%
            </button>
            <button onClick={() => applyFontScale(fontScale + 0.1)}
              title={`Zoom + (${Math.round(fontScale * 100)}%)`}
              data-testid="term-zoom-in"
              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10"
              style={{ color: "var(--hok-ink)" }}>
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {/* TESTE 2/PARTE 3 — ciclo de paletas: CSS vars da casca + OSC na sessão viva */}
          <button onClick={cycleTheme}
            title={`Paleta: ${themeName} (clique para trocar)`}
            data-testid="term-theme"
            className="flex h-8 items-center gap-1.5 rounded-md border px-2 transition-colors hover:bg-white/10"
            style={{ borderColor: "var(--hok-line)", color: "var(--hok-ink)" }}>
            <Palette className="h-3.5 w-3.5" style={{ color: "var(--hok-accent)" }} />
            <span className="hidden text-[10px] font-semibold sm:inline">{themeName}</span>
          </button>
        </div>
      </div>
      {/* PARTE 5 — faixa de abas do redesign religada às sessões tmux reais
          (hok-ttyd legado / hok-terminal-N): x → POST close, + → nova sessão */}
      <div
        data-testid="term-tabs"
        className={`flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${maximized ? "hidden" : ""}`}
        style={{ borderColor: "var(--hok-line)", background: "var(--hok-panel)", zIndex: SHELL_Z.terminalTabs }}
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--hok-muted)" }}>sessions</span>
        <div className="h-5 w-px shrink-0" style={{ background: "var(--hok-line)" }} />
        {tabs.ids.map((id) => {
          const active = id === activeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTabs((s) => ({ ...s, active: id }))}
              data-testid={`term-tab-${id}`}
              title={`Sessão tmux ${sessionNameOf(id)}`}
              className="group flex h-8 min-w-[140px] shrink-0 items-center gap-2 rounded-md border px-2.5 text-left transition-colors"
              style={{
                color: active ? "var(--hok-ink)" : "var(--hok-muted)",
                background: active ? "var(--hok-raised)" : "transparent",
                borderColor: active ? "var(--hok-accent-soft)" : "transparent",
              }}
            >
              <Circle size={8} fill="var(--hok-tmux)" style={{ color: "var(--hok-tmux)" }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold">{id === "ttyd" ? "main" : `t${id}`}</span>
                <span className="block truncate font-mono text-[9px]" style={{ color: "var(--hok-muted)" }}>{sessionNameOf(id)}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Sair sem encerrar ${sessionNameOf(id)} (sessão continua no servidor)`}
                title="Sair sem encerrar (sessão continua)"
                data-testid={`term-detach-${id}`}
                onClick={(event) => { event.stopPropagation(); detachTab(id); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); detachTab(id); } }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-sky-300/70 opacity-40 transition-opacity hover:bg-sky-500/20 hover:text-sky-200 hover:opacity-100"
              >
                <LogOut size={11} />
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Fechar aba e encerrar a sessão ${sessionNameOf(id)} (mata o processo)`}
                data-testid={`term-close-${id}`}
                onClick={(event) => { event.stopPropagation(); closeTab(id); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); closeTab(id); } }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-400/70 opacity-50 transition-opacity hover:bg-red-500/20 hover:text-red-300 hover:opacity-100"
              >
                <X size={12} />
              </span>
            </button>
          );
        })}
        <button type="button" aria-label="Nova sessão de terminal" onClick={openTab} data-testid="term-tab-new" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed transition-colors hover:bg-white/10" style={{ borderColor: "var(--hok-line)", color: "var(--hok-accent)" }}>
          <Plus size={15} />
        </button>
        <div className="ml-auto hidden shrink-0 items-center gap-2 pr-1 sm:flex">
          <span className="font-mono text-[9px]" style={{ color: "var(--hok-muted)" }}>tty/{activeId === "ttyd" ? "00" : activeId.padStart(2, "0")}</span>
          <span className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: "var(--hok-tmux)" }}><Activity size={11} /> attached</span>
        </div>
      </div>
      {/* PARTE 6 — toolbar da seção: status + Reconectar + Maximizar.
          FIX clipboard v2 (24/08): ações de área de transferência viram chips
          ROTULADOS (ícones de 13px não eram notados — feedback do usuário) e
          ganham "Copiar tela" (capture-pane visível, sem copy-mode). */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: err ? "#f87171" : url ? "var(--hok-tmux)" : "#fbbf24" }} />
          <span className="truncate font-mono text-[10px]" style={{ color: "var(--hok-terminal-muted)" }}>
            {err ? err : `${sessionNameOf(activeId)} · ${url ? "anexado" : "conectando…"}`}
          </span>
        </div>
        <div className="thin-scroll ml-1 flex shrink-0 items-center gap-1 overflow-x-auto">
          {selMode ? (
            <>
              <button type="button" data-testid="term-sel-copy" onClick={() => void selectionCopy()}
                title="Copiar o trecho destacado"
                className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-bold"
                style={{ color: "var(--hok-bg)", background: "var(--hok-accent)", borderColor: "var(--hok-accent)" }}>
                <Copy size={12} /> Copiar
              </button>
              <button type="button" data-testid="term-sel-cancel" onClick={() => void selectionCancel()}
                title="Cancelar seleção"
                className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold"
                style={{ color: "var(--hok-muted)", borderColor: "var(--hok-line)" }}>
                <X size={12} /> Cancelar
              </button>
            </>
          ) : (
            <button type="button" data-testid="term-sel-start" onClick={() => void selectionStart()}
              title="Selecionar texto: destaque com as setas da barra e toque em Copiar"
              disabled={selBusy}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-50"
              style={{ color: "var(--hok-terminal-muted)", borderColor: "var(--hok-line)" }}>
              <Square size={11} /> Selecionar
            </button>
          )}
          <button type="button" data-testid="term-copy-screen" onClick={() => void copyScreen()}
            title="Copiar a tela visível (sem alterar o terminal)"
            disabled={selBusy}
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-50"
            style={{ color: "var(--hok-terminal-muted)", borderColor: "var(--hok-line)" }}>
            <Copy size={11} /> Tela
          </button>
          <button type="button" data-testid="term-sel-all" onClick={() => void copyAll()}
            title="Copiar TODO o conteúdo (histórico completo)"
            disabled={selBusy}
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-50"
            style={{ color: "var(--hok-terminal-muted)", borderColor: "var(--hok-line)" }}>
            <ClipboardCopy size={11} /> Tudo
          </button>
          <button type="button" onClick={() => void pasteText()} data-testid="term-paste"
            title="Colar do clipboard no terminal"
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold"
            style={{ color: "var(--hok-accent)", borderColor: "var(--hok-accent-soft)" }}>
            <ClipboardPaste size={12} /> Colar
          </button>
          <button type="button" onClick={startRecovery} title="Reconectar sessão (backoff automático)" data-testid="term-reconnect"
            className="rounded p-1 transition-colors hover:bg-white/10" style={{ color: "var(--hok-terminal-muted)" }}>
            <RotateCcw size={13} />
          </button>
          <button type="button" onClick={() => setMaximized((v) => !v)} title={maximized ? "Sair da tela cheia do terminal" : "Maximizar terminal (oculta header/abas)"} data-testid="term-maximize"
            className="rounded p-1 transition-colors hover:bg-white/10" style={{ color: "var(--hok-accent)" }}>
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg border"
        style={{
          paddingBottom: keysReservePx(keysExpanded, extraGroup, barH) - fitNudgePx,
          background: "var(--hok-terminal)",
          borderColor: "var(--hok-terminal-line)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.025)",
        }}
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
        {/* SCROLL FIX 2 (25/08) — scrollbar SUTIL: invisível em repouso,
            aparece só durante o gesto/arrasto (padrão mobile nativo) e some
            depois de ~0,9s. Arrastar = goto via copy-mode; fundo = volta ao
            vivo. No desktop a roda rola direto (tmux mouse on) e o thumb
            acompanha durante o flash. */}
        <div
          ref={sbTrackRef}
          data-testid="term-scrollbar"
          className={cn(
            "absolute inset-y-0 right-0 w-6 touch-none select-none transition-opacity duration-300",
            sbFlash || sb.dragging ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
          style={{ zIndex: SHELL_Z.terminalScrollbar }}
          onPointerDown={sbOnPointerDown}
          onPointerMove={sbOnPointerMove}
          onPointerUp={sbOnPointerUp}
          onPointerCancel={sbOnPointerUp}
        >
          <div className="absolute inset-y-1 right-1 w-[4px] rounded-full bg-emerald-200/25" />
          <div
            data-testid="term-scrollbar-thumb"
            className="absolute right-0.5 w-[6px] rounded-full bg-emerald-200/60"
            style={{
              height: sbThumbH,
              top: `calc(${(1 - sb.ratio) * 100}% - ${(1 - sb.ratio) * sbThumbH}px)`,
            }}
          />
          {sb.dragging && (
            <div className="absolute right-7 rounded-md border border-emerald-800/60 bg-[#0b1626]/90 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">
              {Math.round((1 - sb.ratio) * 100)}%
            </div>
          )}
        </div>
        {/* SCROLL FIX 2 (25/08) — camada de GESTO (mobile/coarse): captura o
            swipe e traduz em copy-mode; tap curto volta ao vivo + foca o
            iframe (teclado). Só existe quando há histórico real (history>5):
            em TUI/alt-screen o toque vai direto ao iframe. */}
        {coarse && sb.history > 5 && !recovering && (
          <div
            data-testid="term-gesture"
            className="absolute inset-0 touch-none"
            style={{ zIndex: Math.max(1, SHELL_Z.terminalScrollbar - 1) }}
            onTouchStart={onGestureStart}
            onTouchMove={onGestureMove}
            onTouchEnd={onGestureEnd}
            onTouchCancel={onGestureEnd}
          />
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
              // FIX kbfocus v2 (23/08): com teclado aberto, ENCOLHE a altura
              // do iframe (em vez de translateY, que cortava o topo). O resize
              // interno faz o xterm refit → TUI redistribui: scrollback intacto
              // em cima, caixa de digitação pousando logo acima da barra.
              // FIX tremor v2 (24/08): SEM transition — a altura agora só
              // muda no valor settled (uma vez, ao fim da animação do
              // teclado); transition perseguindo valor bruto ERA o tremor.
              height:
                kbShift > 0
                  ? `calc(${100 / fontScale}% - ${kbShift}px)`
                  : `${100 / fontScale}%`,
              transform: `scale(${fontScale})`,
              transformOrigin: "top left",
              width: `${100 / fontScale}%`,
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
          style={{ zIndex: SHELL_Z.keysBarMinimized, bottom: kbInset > 0 ? kbInset + 24 : DOCK_CLEAR_PX }}
        >
          {/* PARTE 7 — ícone minimizado com o visual do mockup (painel +
              borda âmbar + dot tmux + shadow profundo), semântica Maximize2
              preservada e aboveDock(kbInset) incondicional (regra validada). */}
          <button type="button" data-testid="ov-toggle"
            onClick={toggleKeysBar}
            title="Maximizar: ver chat completo + teclado especial"
            className="relative flex h-12 w-12 select-none items-center justify-center rounded-2xl border shadow-[0_10px_32px_rgba(0,0,0,.28)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
            style={{
              background: "var(--hok-panel)",
              borderColor: "var(--hok-accent)",
              color: "var(--hok-accent)",
            }}>
            <Maximize2 className="h-5 w-5" strokeWidth={1.8} />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2" style={{ background: "var(--hok-tmux)", borderColor: "var(--hok-bg)" }} />
          </button>
        </div>
      ) : (
      <div
        ref={barRef}
        data-testid="ov-bar"
        className="absolute left-0 right-0 rounded-t-xl border border-b-0 px-2 pb-2 pt-2"
        style={{
          zIndex: SHELL_Z.keysBarExpanded,
          bottom: aboveDock(kbInset),
          background: "color-mix(in srgb, var(--hok-panel) 96%, transparent)",
          borderColor: "var(--hok-line)",
          boxShadow: "0 -8px 30px rgba(0,0,0,.16)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* GRUPO EXTRA "..." — Alt, Tab/Space/⌫/⏎, Home/End/PgUp/PgDn/Ins/Del,
            símbolos, F1-F12 e sequências ^W ^R ^X ^D ^C ^L ^S ^Z */}
        <div data-testid="ov-extra-group" className={"thin-scroll mb-2 flex w-max items-center gap-1.5 overflow-x-auto border-b pb-2 " + (extraGroup ? "" : "hidden")} style={{ WebkitOverflowScrolling: "touch", borderColor: "var(--hok-line)" }}>
          <KeyButton label="Alt" active={sticky.alt} testid="ov-sticky-alt" onClick={() => toggleSticky("alt")} />
          {NAV_EXTRA.map((xk) => (
            <KeyButton key={xk.label} label={xk.label} testid={`ov-key-${xk.label}`} onClick={() => pressXKey(xk)} />
          ))}
          {EDIT_EXTRA.map((xk) => (
            <KeyButton key={xk.label} label={xk.label} wide={xk.label.length > 3} testid={`ov-key-${xk.label}`} onClick={() => pressXKey(xk)} />
          ))}
          {FN_KEYS.map((xk) => (
            <KeyButton key={xk.label} label={xk.label} testid={`ov-fn-${xk.label}`} onClick={() => pressXKey(xk)} />
          ))}
          {SYM_CHARS.map((s, i) => (
            <KeyButton key={`sym-${i}`} label={s} testid={`ov-sym-${i}`} onClick={() => void sendToKeys({ text: s })} />
          ))}
          {COMBO_KEYS.map((xk) => (
            <KeyButton key={xk.tid ?? xk.label} label={xk.label} wide testid={`ov-combo-${xk.tid}`} onClick={() => pressXKey(xk)} />
          ))}
        </div>
        {/* LINHA SEMPRE VISÍVEL (compacta): recolher · Colar · Ctrl · Esc ·
            setas · S-Tab · "...".
            FIX "..." invisível (24/08): o botão estava DENTRO do container
            `w-max overflow-x-auto` com ml-auto — w-max faz a linha crescer até
            a soma das teclas (~600px) e ml-auto não tem espaço livre nenhum:
            o "..." pousava fora da tela (~390px), só visível arrastando a
            linha. Agora ele fica FORA do fluxo rolável, FIXO na borda direita
            (comportamento Termius). */}
        <div className="flex items-center gap-1.5">
          <div className="thin-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <button type="button" data-testid="ov-collapse"
              onClick={toggleKeysBar}
              title="Minimizar: voltar ao ícone compacto (terminal ocupa o máximo)"
              className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-md border transition-colors hover:bg-white/10"
              style={{ borderColor: "var(--hok-line)", color: "var(--hok-muted)" }}>
              <Minimize2 className="h-4 w-4" />
            </button>
            {/* FIX 24/08 (pedido do usuário): botão Colar REMOVIDO da barra de
                teclas — a toolbar superior já concentra todas as funções de
                área de transferência (Selecionar/Tela/Tudo/Colar). */}
            <KeyButton label="Ctrl" active={sticky.ctrl} testid="ov-sticky-ctrl" onClick={() => toggleSticky("ctrl")} />
            {[k("Esc", "Escape")].map((xk) => (
              <KeyButton key={xk.label} label={xk.label} testid={`ov-key-${xk.label}`} onClick={() => pressXKey(xk)} />
            ))}
            {ROW_KEYS.map((xk) => (
              <KeyButton key={xk.tid ?? xk.label} label={xk.label} wide={xk.label.length > 3} testid={`ov-key-${xk.tid ?? xk.label}`} onClick={() => pressXKey(xk)} />
            ))}
          </div>
          <button type="button" data-testid="ov-more"
            aria-expanded={extraGroup}
            aria-label="Mais teclas"
            onClick={() => setExtraGroup((v) => !v)}
            title="Mais teclas (Alt, Tab, Ins/Del, Home/Pg, símbolos, F1-F12, ^combos)"
            className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-md border transition-colors hover:bg-white/10"
            style={{
              borderColor: extraGroup ? "var(--hok-accent)" : "var(--hok-line)",
              color: extraGroup ? "var(--hok-accent)" : "var(--hok-ink)",
              background: extraGroup ? "var(--hok-accent-soft)" : "var(--hok-key)",
            }}>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
      )}
      {/* FIX clipboard v2 (24/08): feedback VISÍVEL — o estado toast já
          existia desde o TESTE E mas nunca foi renderizado (o usuário não
          via confirmação nenhuma de copiar/colar). Chip flutuante no topo. */}
      {toast && (
        <div
          data-testid="term-toast"
          className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border px-3 py-1 text-[11px] font-bold shadow-lg backdrop-blur-sm"
          style={{
            zIndex: SHELL_Z.terminalRecovery,
            color: "var(--hok-accent)",
            borderColor: "var(--hok-accent-soft)",
            background: "color-mix(in srgb, var(--hok-panel) 92%, transparent)",
          }}
        >
          {toast}
        </div>
      )}
      {/* FIX clipboard v2: modal de colagem manual — usado quando a leitura
          do clipboard do sistema é negada (http://IP-LAN, WebViews). O campo
          nativo aceita long-press → Colar em QUALQUER dispositivo. */}
      {pasteOpen && (
        <div
          data-testid="term-paste-modal"
          className="absolute inset-0 flex items-center justify-center bg-black/60 p-4"
          style={{ zIndex: SHELL_Z.terminalModal }}
          onClick={() => setPasteOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border p-3"
            style={{ background: "var(--hok-panel)", borderColor: "var(--hok-line)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1.5 text-[12px] font-bold" style={{ color: "var(--hok-ink)" }}>
              Colar no terminal
            </p>
            <p className="mb-2 text-[10px]" style={{ color: "var(--hok-muted)" }}>
              Toque e segure o campo abaixo → <b>Colar</b> (menu nativo).
            </p>
            <textarea
              autoFocus
              data-testid="term-paste-input"
              value={pasteDraft}
              onChange={(e) => setPasteDraft(e.target.value)}
              rows={4}
              placeholder="Cole aqui o texto…"
              className="w-full resize-none rounded-md border bg-black/30 p-2 font-mono text-[12px] outline-none"
              style={{ color: "var(--hok-terminal-ink)", borderColor: "var(--hok-line)" }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setPasteOpen(false)}
                className="rounded-md border px-3 py-1.5 text-[11px] font-semibold"
                style={{ color: "var(--hok-muted)", borderColor: "var(--hok-line)" }}>
                Cancelar
              </button>
              <button type="button" data-testid="term-paste-confirm" disabled={!pasteDraft.trim()}
                onClick={() => void confirmPasteModal()}
                className="rounded-md border px-3 py-1.5 text-[11px] font-bold disabled:opacity-40"
                style={{ color: "var(--hok-bg)", background: "var(--hok-accent)", borderColor: "var(--hok-accent)" }}>
                Inserir no terminal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
