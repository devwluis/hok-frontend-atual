"use client";
import { useEffect, useState } from "react";
import { Folder, FileText, FileCode, FileJson } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";
import { hokGet } from "@/lib/hok-api";

type FileEntry = { name: string; is_dir: boolean; size: number };

type FileCard = {
  name: string;
  type: "code" | "json" | "text" | "folder";
  size: string;
  modified: string;
};

const ICON = {
  code: FileCode,
  json: FileJson,
  text: FileText,
  folder: Folder,
};

function typeOf(name: string, isDir: boolean): FileCard["type"] {
  if (isDir) return "folder";
  if (name.endsWith(".json")) return "json";
  if (/\.(go|ts|tsx|js|jsx|py|sh|rb|java|c|cpp)$/.test(name)) return "code";
  return "text";
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function FilesScreen() {
  const [files, setFiles] = useState<FileCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hokGet<{ files: FileEntry[]; path: string; status: string }>("/files").then((res) => {
      if (!active) return;
      if (res.ok) {
        setFiles((res.data.files || []).map((f) => ({
          name: f.name,
          type: typeOf(f.name, f.is_dir),
          size: formatSize(f.size),
          modified: "—",
        })));
      } else {
        setError(res.error);
      }
    });
    return () => { active = false; };
  }, []);

  return (
    <ScreenFrame>
      <ScreenHeader title="Files" subtitle="Arquivos do projeto e armazenamento local." />
      {error && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Falha ao carregar os arquivos: {error}
        </div>
      )}
      {!error && files.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhum arquivo listado.</div>
      )}
      <div className="space-y-2">
        {files.map((f) => {
          const Icon = ICON[f.type] ?? FileText;
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