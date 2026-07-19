"use client";
import { motion } from "framer-motion";
import { MessageCircle, Terminal, Workflow, Brain, Settings } from "lucide-react";
import { useAppState } from "@/hooks/use-app-state";
import type { ScreenId } from "@/lib/app-state";
import { cn } from "@/lib/utils";

const ITEMS: { id: ScreenId; label: string; Icon: typeof MessageCircle }[] = [
  { id: "chat", label: "Chat", Icon: MessageCircle },
  { id: "terminal", label: "Terminal", Icon: Terminal },
  { id: "n8n", label: "N8N", Icon: Workflow },
  { id: "brain", label: "Memory", Icon: Brain },
  { id: "settings", label: "Settings", Icon: Settings },
];

export function Dock() {
  const { screen, setScreen } = useAppState();

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 flex items-end justify-center pb-2 pointer-events-none">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        className="pointer-events-auto flex items-center gap-1 rounded-[28px] border border-border bg-card/90 px-3 py-2 shadow-[var(--shadow-window)] backdrop-blur-xl"
      >
        {ITEMS.map(({ id, label, Icon }) => {
          const active = screen === id;
          return (
            <motion.button
              key={id}
              onClick={() => setScreen(id)}
              whileTap={{ scale: 0.88 }}
              className={cn(
                "relative flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors",
                active
                  ? "bg-[color:var(--amber)]/15 text-[color:var(--amber)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-label={label}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[9px] font-medium">{label}</span>
              {active && (
                <motion.span
                  layoutId="dock-indicator"
                  className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[color:var(--amber)]"
                />
              )}
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
