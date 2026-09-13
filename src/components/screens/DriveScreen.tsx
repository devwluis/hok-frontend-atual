"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Folder, FileText, File, ChevronRight, ChevronLeft, RefreshCw,
  Upload, FolderPlus, Search, Pencil, Trash2, Move, MoreHorizontal,
  Check, X, Loader2, AlertTriangle, ExternalLink,
} from "lucide-react";
import { ScreenFrame, ScreenHeader, Card, AmberButton } from "@/components/shell/ScreenFrame";
import { cn } from "@/lib/utils";
import {
  driveListFiles, driveSearch, driveFolderInfo, driveUpload,
  driveCreateFolder, driveRename, driveMove, driveDelete,
  getDriveFolderId, persistDriveSettings, type DriveFile,
} from "@/lib/drive-api";

function isFolder(f: DriveFile): boolean {
  return f.mimeType === "application/vnd.google-apps.folder";
}

function isGoogleDoc(f: DriveFile): boolean {
  return f.mimeType.startsWith("application/vnd.google-apps.");
}

function fileIcon(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.folder") return "📁";
  if (mimeType === "application/vnd.google-apps.document") return "📄";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "📊";
  if (mimeType === "application/vnd.google-apps.presentation") return "📽️";
  if (mimeType === "application/vnd.google-apps.pdf") return "📕";
  if (mimeType.includes("image/")) return "🖼️";
  if (mimeType.includes("video/")) return "🎬";
  if (mimeType.includes("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📕";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "📦";
  return "📎";
}

function formatSize(bytes?: string): string {
  if (!bytes) return "";
  const b = parseInt(bytes, 10);
  if (isNaN(b)) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function DriveScreen() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>(() => getDriveFolderId());
  const [folderPath, setFolderPath] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [moveId, setMoveId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadFiles = useCallback(async (folderId: string, query?: string) => {
    setLoading(true);
    setError(null);
    try {
      if (query) {
        const res = await driveSearch(query, folderId);
        setFiles(res.files || []);
      } else {
        const res = await driveListFiles(folderId, undefined, folderId === getDriveFolderId());
        setFiles(res.files || []);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar arquivos";
      setError(msg);
      showToast("Erro ao carregar Drive: " + msg, "err");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPath = useCallback(async (folderId: string) => {
    if (folderId === getDriveFolderId()) {
      setFolderPath([]);
      return;
    }
    try {
      const info = await driveFolderInfo(folderId);
      setFolderPath((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].id === folderId) return prev;
        return [...prev, info];
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadFiles(currentFolderId);
  }, [currentFolderId, loadFiles]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) {
      setIsSearching(false);
      loadFiles(currentFolderId);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => {
      loadFiles(currentFolderId, q);
    }, 500);
  };

  const handleFolderClick = async (folderId: string) => {
    setActionMenuId(null);
    setRenameId(null);
    setMoveId(null);
    setConfirmDeleteId(null);
    const info = await driveFolderInfo(folderId);
    setFolderPath((prev) => {
      const idx = prev.findIndex((p) => p.id === folderId);
      if (idx >= 0) return prev.slice(0, idx + 1);
      return [...prev, info];
    });
    setCurrentFolderId(folderId);
  };

  const handleBack = () => {
    if (folderPath.length === 0) return;
    const parent = folderPath[folderPath.length - 1];
    setCurrentFolderId(parent.id);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await driveCreateFolder(newFolderName.trim(), currentFolderId);
      if (res) {
        setShowCreateFolder(false);
        setNewFolderName("");
        loadFiles(currentFolderId);
        showToast("Pasta criada com sucesso", "ok");
      } else {
        showToast("Erro ao criar pasta", "err");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro", "err");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const res = await driveUpload(file, currentFolderId);
      if (res) {
        setShowUpload(false);
        loadFiles(currentFolderId);
        showToast(`"${res.name}" enviado`, "ok");
      } else {
        showToast("Erro ao enviar arquivo", "err");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro", "err");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRename = async () => {
    if (!renameId || !renameName.trim()) return;
    try {
      const ok = await driveRename(renameId, renameName.trim());
      if (ok) {
        setRenameId(null);
        setRenameName("");
        loadFiles(currentFolderId);
        showToast("Renomeado", "ok");
      } else {
        showToast("Erro ao renomear", "err");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro", "err");
    }
  };

  const handleMove = async () => {
    if (!moveId || !moveTarget) return;
    try {
      const ok = await driveMove(moveId, moveTarget, true);
      if (ok) {
        setMoveId(null);
        setMoveTarget("");
        loadFiles(currentFolderId);
        showToast("Movido", "ok");
      } else {
        showToast("Erro ao mover", "err");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro", "err");
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      const ok = await driveDelete(fileId);
      if (ok) {
        setConfirmDeleteId(null);
        loadFiles(currentFolderId);
        showToast("Deletado", "ok");
      } else {
        showToast("Erro ao deletar", "err");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro", "err");
    }
  };

  const currentFolderName = folderPath.length > 0 ? folderPath[folderPath.length - 1].name : "Caixa Preta";

  return (
    <ScreenFrame>
      <ScreenHeader
        title="Google Drive"
        subtitle="Arquivos e pastas no seu Drive."
        action={
          <div className="flex items-center gap-1">
            <button onClick={() => setShowUpload((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-[color:var(--amber)]/50 hover:text-[color:var(--amber)] transition-colors"
              title="Enviar arquivo">
              <Upload className="h-3.5 w-3.5" />
              Enviar
            </button>
            <button onClick={() => setShowCreateFolder((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-[color:var(--amber)]/50 hover:text-[color:var(--amber)] transition-colors"
              title="Nova pasta">
              <FolderPlus className="h-3.5 w-3.5" />
              Pasta
            </button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar arquivos..."
            className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[color:var(--amber)]/60"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        <button onClick={() => loadFiles(currentFolderId)} disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="Atualizar">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        <button onClick={() => { setCurrentFolderId(getDriveFolderId()); setFolderPath([]); }}
          className="rounded-lg px-2 py-1 hover:bg-accent hover:text-foreground">
          Drive
        </button>
        {folderPath.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button onClick={() => {
              setCurrentFolderId(f.id);
              setFolderPath(folderPath.slice(0, i + 1));
            }}
              className="rounded-lg px-2 py-1 hover:bg-accent hover:text-foreground">
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Upload form */}
      {showUpload && (
        <Card className="mb-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Enviar arquivo</div>
          <input ref={fileInputRef} type="file" className="text-[11px] text-muted-foreground"
            onChange={handleUpload} disabled={isUploading} />
          <div className="flex items-center gap-2">
            <AmberButton onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="!py-2 !text-[12px]">
              {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {isUploading ? "Enviando..." : "Escolher arquivo"}
            </AmberButton>
            <button onClick={() => setShowUpload(false)}
              className="rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent">
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {/* Create folder form */}
      {showCreateFolder && (
        <Card className="mb-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nova pasta</div>
          <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setShowCreateFolder(false); }}
            placeholder="Nome da pasta..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[color:var(--amber)]/60" />
          <div className="flex items-center gap-2">
            <AmberButton onClick={handleCreateFolder} className="!py-2 !text-[12px]">
              <FolderPlus className="h-3.5 w-3.5" />
              Criar
            </AmberButton>
            <button onClick={() => { setShowCreateFolder(false); setNewFolderName(""); }}
              className="rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent">
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {/* Files list */}
      <div className="space-y-2">
        {loading && files.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}

        {!loading && !error && files.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Folder className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">
              {searchQuery ? "Nenhum resultado encontrado" : "Pasta vazia"}
            </p>
          </div>
        )}

        {files.map((file) => {
          const folder = isFolder(file);
          const pendingDelete = confirmDeleteId === file.id;
          const isRename = renameId === file.id;
          const isMove = moveId === file.id;
          const actionOpen = actionMenuId === file.id;

  return (
    <div key={file.id} className={cn(
      "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
      folder
        ? "border-border bg-card hover:border-[color:var(--amber)]/30"
        : "border-border bg-card hover:border-border",
    )}>
              {/* Icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-[16px]">
                {folder ? <Folder className="h-4 w-4 text-[color:var(--amber)]" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
              </div>

              {/* Name / Rename */}
              <div className="min-w-0 flex-1">
                {isRename ? (
                  <input autoFocus value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameId(null); }}
                    onBlur={() => setRenameId(null)}
                    className="w-full rounded bg-background px-2 py-0.5 text-[13px] font-semibold outline-none ring-1 ring-[color:var(--amber)]/60 text-foreground" />
                ) : folder ? (
                  <button onClick={() => handleFolderClick(file.id)}
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground hover:text-[color:var(--amber)]">
                    {file.name}
                    <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-40" />
                  </button>
                ) : (
                  <span className="truncate text-[13px] font-semibold text-foreground">{file.name}</span>
                )}
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {folder ? (
                    <span>{file.size ? `${parseInt(file.size).toLocaleString()} itens` : ""}</span>
                  ) : isGoogleDoc(file) ? (
                    <span className="capitalize">{file.mimeType.replace("application/vnd.google-apps.", "")}</span>
                  ) : (
                    <span>{file.mimeType}</span>
                  )}
                  {file.size && !folder && <span>· {formatSize(file.size)}</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {folder && (
                  <a href={`https://drive.google.com/drive/folders/${file.id}`} target="_blank" rel="noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button onClick={() => { setRenameId(file.id); setRenameName(file.name); setActionMenuId(null); }}
                  title="Renomear"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setMoveId(file.id); setMoveTarget(""); setActionMenuId(null); }}
                  title="Mover"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Move className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setConfirmDeleteId(file.id); setActionMenuId(null); }}
                  title="Excluir"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    pendingDelete ? "bg-destructive text-white" : "text-muted-foreground hover:bg-destructive/15 hover:text-destructive")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Rename inline */}
              {isRename && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-card z-10">
                  <button onClick={handleRename} className="flex h-6 w-6 items-center justify-center rounded bg-[color:var(--amber)]/15 text-[color:var(--amber)]">
                    <Check className="h-3 w-3" />
                  </button>
                  <button onClick={() => setRenameId(null)} className="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Move inline */}
              {isMove && (
                <div className="absolute inset-x-0 top-full mt-1 z-10">
                  <Card className="p-3 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mover para pasta</div>
                    <input value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}
                      placeholder="ID da pasta destino"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] font-mono outline-none focus:ring-1 focus:ring-[color:var(--amber)]/60" />
                    <div className="flex items-center gap-2">
                      <AmberButton onClick={handleMove} className="!py-1.5 !text-[12px]">
                        <Move className="h-3 w-3" />
                        Mover
                      </AmberButton>
                      <button onClick={() => setMoveId(null)}
                        className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent">
                        Cancelar
                      </button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)}>
          <div className="w-[320px] rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-window)] space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Excluir permanentemente?
            </div>
            <p className="text-[11px] text-muted-foreground">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <AmberButton onClick={() => handleDelete(confirmDeleteId)} className="flex-1 !py-2 !text-[12px]">
                Deletar
              </AmberButton>
              <button onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-4 right-4 z-50 rounded-xl px-4 py-2 text-[12px] font-medium shadow-lg",
          toast.type === "ok" ? "bg-emerald-500/90 text-white" : "bg-destructive/90 text-white",
        )}>
          {toast.msg}
        </div>
      )}
    </ScreenFrame>
  );
}
