import { useCallback, useState } from "react";

const SETTINGS_KEY = "hokma.settings.v1";
const OWNER_JWT_KEY = "hokma.owner.jwt.v1";

function getServerUrl(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed["Server URL"]) return String(parsed["Server URL"]).replace(/\/$/, "");
    }
  } catch {}
  return "";
}

export function useOwnerAuth() {
  const [isOwner, setIsOwner] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OWNER_JWT_KEY) !== null;
    } catch {
      return false;
    }
  });

  const login = useCallback(async (password: string): Promise<boolean> => {
    const baseUrl = getServerUrl();
    if (!baseUrl) return false;
    try {
      const res = await fetch(`${baseUrl}/auth/owner-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.token) return false;
      localStorage.setItem(OWNER_JWT_KEY, String(data.token));
      setIsOwner(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(OWNER_JWT_KEY);
    } catch {}
    setIsOwner(false);
  }, []);

  return { isOwner, login, logout };
}
