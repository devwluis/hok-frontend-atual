"use client";
import { motion } from "framer-motion";
import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/lib/utils";

const ICON_SRCS = {
  chat: "/icons/hok-chat.png?v=2",
  terminal: "/icons/hok-terminal.png?v=2",
  n8n: "/icons/hok-n8n.png?v=2",
  settings: "/icons/hok-config.png?v=2",
} as const;

const ITEMS = [
  { id: "chat" as const, label: "Chat" },
  { id: "terminal" as const, label: "Terminal" },
  { id: "n8n" as const, label: "N8N" },
  { id: "settings" as const, label: "Config" },
] as const;

export function Dock() {
  const { screen, setScreen, keyboardOpen } = useAppState();
  // FIX kbhide (23/08): oculto enquanto o teclado do sistema está aberto na
  // tela Terminal — não sobrepor a barra de teclas especiais. Volta quando
  // o teclado fecha (visualViewport dispara e o estado global reseta).
  const oculto = keyboardOpen && screen === "terminal";

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-1/2 z-[100] -translate-x-1/2 transition-all duration-200",
        oculto ? "bottom-[-96px] opacity-0" : "bottom-4 opacity-100",
      )}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover/90 px-4 py-3 shadow-[var(--shadow-window)] backdrop-blur-md"
      >
        {ITEMS.map(({ id, label }) => {
          const active = screen === id;
          return (
            <motion.button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              whileTap={{ scale: 0.88 }}
              className={cn(
                "hok-dock-item relative flex h-[64px] w-[68px] flex-col items-center justify-center gap-1 rounded-2xl transition-colors",
                active
                  ? "bg-[color:var(--amber)]/15 text-[color:var(--amber)] ring-1 ring-[color:var(--amber)]/40"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              data-testid={`button-dock-${id}`}
            >
              <img
                src={ICON_SRCS[id]}
                alt=""
                aria-hidden="true"
                className={cn("h-9 w-9 rounded-lg object-cover transition-opacity", active ? "opacity-100" : "opacity-70")}
              />
              <span className="text-[10px] font-semibold tracking-wide">{label}</span>
              {active && (
                <motion.span
                  layoutId="dock-indicator"
                  className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[color:var(--amber)]"
                />
              )}
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}