"use client";
import { motion } from "framer-motion";
import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/lib/utils";
import { SHELL_Z } from "@/lib/shell-layers";

const ICON_SRCS = {
  chat: "/icons/hok-chat.png?v=2",
  terminal: "/icons/hok-terminal.png?v=2",
  n8n: "/icons/hok-n8n.png?v=2",
  settings: "/icons/hok-config.png?v=2",
  preview: "/icons/hok-terminal.png?v=2",
} as const;

const ITEMS = [
  { id: "chat" as const, label: "Chat" },
  { id: "terminal" as const, label: "Terminal" },
  { id: "n8n" as const, label: "N8N" },
  { id: "preview" as const, label: "Preview" },
  { id: "settings" as const, label: "Config" },
] as const;

export function Dock() {
  const { screen, setScreen } = useAppState();

  // FIX camadas (23/08): Dock SEMPRE visível — a hierarquia pedida coloca a
  // navegação ABAIXO da barra de teclas (visível), nunca escondida. A folga
  // geométrica (DOCK_CLEAR_PX via aboveDock) evita sobreposição real.
  return (
    <div
      data-testid="dock-root"
      className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2"
      style={{ zIndex: SHELL_Z.dock }}
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