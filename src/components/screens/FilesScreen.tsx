"use client";
import { Folder, FileText, FileCode, FileJson } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";

const FILES = [
  { name: "src/routes/api/chat.ts", type: "code", size: "4.9 KB", modified: "hoje" },
  { name: "src/components/screens/ChatScreen.tsx", type: "code", size: "8.2 KB", modified: "hoje" },
  { name: "src/lib/chat-stream.ts", type: "code", size: "4.3 KB", modified: "hoje" },
  { name: "src/hooks/use-backend-status.ts", type: "code", size: "2.2 KB", modified: "hoje" },
  { name: "hokma.settings.v1", type: "json", size: "< 1 KB", modified: "hoje" },
  { name: "hokma.conversations.v1", type: "json", size: "dinâmico", modified: "hoje" },
  { name: "hokma.n8n.settings.v1", type: "json", size: "< 1 KB", modified: "hoje" },
];

const ICON = {
  code: FileCode,
  json: FileJson,
  text: FileText,
  folder: Folder,
};

export function FilesScreen() {
  return (
    <ScreenFrame>
      <ScreenHeader title="Files" subtitle="Arquivos do projeto e armazenamento local." />
      <div className="space-y-2">
        {FILES.map((f) => {
          const Icon = ICON[f.type as keyof typeof ICON] ?? FileText;
          return (
            <Card key={f.name} className="flex items-center gap-3 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--amber)]/15 text-[color:var(--amber)] shrink-0">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate font-mono text-sm">{f.name}</div>
                <div className="text-[10px] text-muted-foreground">{f.size} · {f.modified}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
