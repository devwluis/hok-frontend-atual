"use client";
import { Menu, Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import { useAppState } from "@/hooks/use-app-state";
import { useBackendStatus } from "@/hooks/use-backend-status";
import logo from "@/assets/hok-logo.png";

export function TopBar() {
  const { theme, toggle } = useTheme();
  const { toggleDrawer } = useAppState();
  const status = useBackendStatus();
  const isOnline = status === "online";
  const isChecking = status === "checking";
  const dotColor = isOnline ? "var(--online)" : isChecking ? "#f59e0b" : "#ef4444";
  const label = isOnline ? "Online" : isChecking ? "Verificando" : "Offline";

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/70 px-3 backdrop-blur-xl">
      <button
        onClick={() => toggleDrawer()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
        <motion.img
          src={logo}
          alt="H.O.K."
          className="h-8 w-8 rounded-xl object-contain"
          style={{ filter: "drop-shadow(0 0 6px rgba(245,166,35,0.5))" }}
          initial={{ rotate: -8, scale: 0.9, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1, transition: { duration: 0.3 } }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-widest text-[color:var(--amber)]">H.O.K.</span>
          <span className="text-[9px] font-mono tracking-wider text-muted-foreground uppercase">Dev · N8N · Automação</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-[11px] font-medium">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: dotColor, boxShadow: isOnline ? `0 0 6px ${dotColor}` : undefined }}
          />
          <span className="text-muted-foreground">{label}</span>
        </div>
        <button
          onClick={toggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
          aria-label="Alternar tema"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
