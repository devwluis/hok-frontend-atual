"use client";
import { type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppState } from "@/hooks/use-app-state";
import { TopBar } from "./TopBar";
import { Dock } from "./Dock";
import { Drawer } from "./Drawer";
import { SettingsModal } from "./SettingsModal";
import { ChatScreen } from "@/components/screens/ChatScreen";
import { TerminalScreen } from "@/components/screens/TerminalScreen";
import { N8NScreen } from "@/components/screens/N8NScreen";
import { BrainScreen } from "@/components/screens/BrainScreen";
import { ModelsScreen } from "@/components/screens/ModelsScreen";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { SessionScreen } from "@/components/screens/SessionScreen";
import { AgentScreen } from "@/components/screens/AgentScreen";
import { MemoryScreen } from "@/components/screens/MemoryScreen";
import { DeployScreen } from "@/components/screens/DeployScreen";
import { GithubScreen } from "@/components/screens/GithubScreen";
import { DBStudioScreen } from "@/components/screens/DBStudioScreen";
import { MetricsScreen } from "@/components/screens/MetricsScreen";
import { FilesScreen } from "@/components/screens/FilesScreen";
import { CodexScreen } from "@/components/screens/CodexScreen";
import { FlowScreen } from "@/components/screens/FlowScreen";
import { CRMScreen } from "@/components/screens/CRMScreen";

const SCREENS: Record<string, { render: () => ReactNode }> = {
  chat: { render: () => <ChatScreen /> },
  terminal: { render: () => <TerminalScreen /> },
  n8n: { render: () => <N8NScreen /> },
  brain: { render: () => <BrainScreen /> },
  models: { render: () => <ModelsScreen /> },
  settings: { render: () => <SettingsScreen /> },
  session: { render: () => <SessionScreen /> },
  agent: { render: () => <AgentScreen /> },
  memory: { render: () => <MemoryScreen /> },
  deploy: { render: () => <DeployScreen /> },
  github: { render: () => <GithubScreen /> },
  dbstudio: { render: () => <DBStudioScreen /> },
  metrics: { render: () => <MetricsScreen /> },
  files: { render: () => <FilesScreen /> },
  codex: { render: () => <CodexScreen /> },
  flow: { render: () => <FlowScreen /> },
  crm: { render: () => <CRMScreen /> },
};

export function AppShell() {
  const { screen } = useAppState();
  const current = SCREENS[screen] ?? SCREENS.chat;

  return (
    <div className="relative flex h-dvh w-full flex-col bg-background text-foreground">
      <TopBar />
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            initial={{ scale: 0.9, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="absolute inset-0 overflow-hidden"
          >
            {current.render()}
          </motion.div>
        </AnimatePresence>
      </main>
      <Dock />
      <Drawer />
      <SettingsModal />
    </div>
  );
}
