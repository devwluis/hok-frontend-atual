"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, X, Save, Check } from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { usePersistentState } from "@/lib/use-persistent-state";

// Unified settings key — same as SettingsScreen
const SETTINGS_KEY = "hokma.settings.v1";

const KEYS = [
  { k: "Server URL", placeholder: "https://api.hokma.dev" },
  { k: "HOK_TOKEN", placeholder: "hok_••••••••" },
  { k: "DeepSeek", placeholder: "ds_•••" },
  { k: "OpenRouter", placeholder: "or_•••" },
  { k: "Gemini", placeholder: "gm_•••" },
  { k: "OpenAI", placeholder: "sk_•••" },
  { k: "Groq", placeholder: "gq_•••" },
  { k: "Anthropic", placeholder: "an_•••" },
];

export function SettingsModal() {
  const { settingsOpen, toggleSettings } = useAppState();
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [values, setValues] = usePersistentState<Record<string, string>>(SETTINGS_KEY, {});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});

  const markSaved = (k: string) => {
    setSavedAt((s) => ({ ...s, [k]: Date.now() }));
    setTimeout(() => {
      setSavedAt((s) => {
        const n = { ...s };
        delete n[k];
        return n;
      });
    }, 1500);
  };

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          onClick={() => toggleSettings(false)}
        >
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="m-3 w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-window)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Configurações rápidas</h3>
              <button onClick={() => toggleSettings(false)} className="rounded-lg p-1.5 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 thin-scroll">
              {KEYS.map(({ k, placeholder }) => (
                <div key={k}>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{k}</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={shown[k] ? "text" : "password"}
                        value={values[k] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-9 text-sm outline-none transition focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
                      />
                      <button
                        onClick={() => setShown((s) => ({ ...s, [k]: !s[k] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Mostrar"
                      >
                        {shown[k] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      onClick={() => markSaved(k)}
                      className="inline-flex items-center gap-1 rounded-xl bg-[color:var(--amber)] px-3 py-2 text-xs font-semibold text-[color:var(--amber-foreground)] hover:opacity-90"
                    >
                      {savedAt[k] ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                      {savedAt[k] ? "Salvo" : "Salvar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
