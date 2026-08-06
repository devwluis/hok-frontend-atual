import { useCallback, useState } from "react";

const OWNER_KEY = "hokma.owner.v1";
const OWNER_HASH = "5f6c0727ad559bbb67b55ef02cd79e47686e86e0a40696da7479983475f64887";

async function sha256(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function useOwnerAuth() {
  const [isOwner, setIsOwner] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OWNER_KEY) === "1";
    } catch {
      return false;
    }
  });

  const login = useCallback(async (password: string): Promise<boolean> => {
    const hash = await sha256(password);
    if (hash === OWNER_HASH) {
      try {
        localStorage.setItem(OWNER_KEY, "1");
      } catch {}
      setIsOwner(true);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(OWNER_KEY);
    } catch {}
    setIsOwner(false);
  }, []);

  return { isOwner, login, logout };
}
