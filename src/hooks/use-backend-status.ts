import { useEffect, useState } from "react";

export type BackendStatus = "checking" | "online" | "offline";

const SETTINGS_KEY = "hokma.settings.v1";
const INTERVAL = 30_000;

function readSettings(): { url: string; token: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { url: "", token: "" };
    const s = JSON.parse(raw) as Record<string, string>;
    return {
      url: s["Server URL"] || "",
      token: s["HOK_TOKEN"] || "",
    };
  } catch {
    return { url: "", token: "" };
  }
}

async function ping(url: string, token: string, signal: AbortSignal): Promise<boolean> {
  const candidates = [
    url.replace(/\/$/, "") + "/health",
    url.replace(/\/$/, "") + "/healthz",
    url.replace(/\/$/, "") + "/status",
    url.replace(/\/$/, "") + "/ping",
  ];

  const headers: Record<string, string> = {};
  if (token) headers["X-Hok-Token"] = token;

  for (const endpoint of candidates) {
    try {
      const res = await fetch(endpoint, { signal, headers, method: "GET" });
      if (res.ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const { url, token } = readSettings();
      if (!url) {
        if (!cancelled) setStatus("offline");
      } else {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 5000);
        const ok = await ping(url, token, ctl.signal);
        clearTimeout(t);
        if (!cancelled) setStatus(ok ? "online" : "offline");
      }
      if (!cancelled) timer = setTimeout(tick, INTERVAL);
    };

    tick();

    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) {
        if (!cancelled) setStatus("checking");
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return status;
}
