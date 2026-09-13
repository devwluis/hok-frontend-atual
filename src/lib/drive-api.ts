import { readSettings } from "./hok-api";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string;
  modifiedTime?: string;
};

export type DriveFileList = {
  files: DriveFile[];
  nextPageToken?: string;
};

const DRIVE_SETTINGS_KEY = "hokma.drive.settings.v1";
const DEFAULT_DRIVE_FOLDER = "16zPoX8HrHOHCZgKezWwNmOEQad1eOBjN";

export type DriveSettings = {
  defaultFolderId: string;
};

function loadDriveSettings(): DriveSettings {
  try {
    const raw = localStorage.getItem(DRIVE_SETTINGS_KEY);
    if (!raw) return { defaultFolderId: DEFAULT_DRIVE_FOLDER };
    const parsed = JSON.parse(raw) as Partial<DriveSettings>;
    return { defaultFolderId: parsed.defaultFolderId || DEFAULT_DRIVE_FOLDER };
  } catch {
    return { defaultFolderId: DEFAULT_DRIVE_FOLDER };
  }
}

export function persistDriveSettings(data: DriveSettings) {
  localStorage.setItem(DRIVE_SETTINGS_KEY, JSON.stringify(data));
}

export function getDriveFolderId(): string {
  return loadDriveSettings().defaultFolderId;
}

function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const { token } = readSettings();
  const headers: Record<string, string> = {
    "X-Conversation-Id": crypto.randomUUID(),
    ...extra,
  };
  if (token) headers["X-Hok-Token"] = token;
  return headers;
}

export async function driveListFiles(folderId?: string, query?: string, onlyFolders?: boolean): Promise<DriveFileList> {
  const { serverUrl } = readSettings();
  if (!serverUrl) return { files: [] };
  const params = new URLSearchParams();
  if (folderId) params.set("folder_id", folderId);
  if (query) params.set("q", query);
  if (onlyFolders) params.set("onlyFolders", "true");
  const url = serverUrl.replace(/\/$/, "") + `/drive/files?${params.toString()}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return (data as DriveFileList) || { files: [] };
}

export async function driveSearch(query: string, folderId?: string): Promise<DriveFileList> {
  const { serverUrl } = readSettings();
  if (!serverUrl) return { files: [] };
  const params = new URLSearchParams();
  if (folderId) params.set("folder_id", folderId);
  params.set("q", query);
  const url = serverUrl.replace(/\/$/, "") + `/drive/search?${params.toString()}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return (data as DriveFileList) || { files: [] };
}

export async function driveFolderInfo(folderId: string): Promise<DriveFile & { children?: DriveFile[] }> {
  const { serverUrl } = readSettings();
  if (!serverUrl) return { id: folderId, name: "", mimeType: "" };
  const url = serverUrl.replace(/\/$/, "") + `/drive/folder/${encodeURIComponent(folderId)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return (data as DriveFile & { children?: DriveFile[] }) || { id: folderId, name: "", mimeType: "" };
}

export async function driveUpload(file: File, folderId?: string): Promise<DriveFile | null> {
  const { serverUrl } = readSettings();
  if (!serverUrl) return null;
  const formData = new FormData();
  formData.append("file", file);
  if (folderId) formData.append("folder_id", folderId);
  const url = serverUrl.replace(/\/$/, "") + "/drive/upload";
  const res = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders() as unknown as Record<string, string>,
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return (data as { file?: DriveFile }).file ?? null;
}

export async function driveCreateFolder(name: string, parentId?: string): Promise<DriveFile | null> {
  const { serverUrl } = readSettings();
  if (!serverUrl) return null;
  const payload = { name, parent_id: parentId || "" };
  const url = serverUrl.replace(/\/$/, "") + "/drive/create-folder";
  const res = await fetch(url, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return (data as { file?: DriveFile }).file ?? null;
}

export async function driveRename(fileId: string, newName: string): Promise<boolean> {
  const { serverUrl } = readSettings();
  if (!serverUrl) return false;
  const payload = { file_id: fileId, new_name: newName };
  const url = serverUrl.replace(/\/$/, "") + "/drive/rename";
  const res = await fetch(url, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function driveMove(fileId: string, folderId: string, removeOld = true): Promise<boolean> {
  const { serverUrl } = readSettings();
  if (!serverUrl) return false;
  const payload = { file_id: fileId, folder_id: folderId, remove_old: removeOld };
  const url = serverUrl.replace(/\/$/, "") + "/drive/move";
  const res = await fetch(url, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function driveDelete(fileId: string): Promise<boolean> {
  const { serverUrl } = readSettings();
  if (!serverUrl) return false;
  const payload = { file_id: fileId, trash: true };
  const url = serverUrl.replace(/\/$/, "") + "/drive/delete";
  const res = await fetch(url, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}
