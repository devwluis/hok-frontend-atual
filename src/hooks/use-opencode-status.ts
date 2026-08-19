"use client";
import { useCallback, useEffect, useState } from "react";
import { readSettings } from "@/lib/hok-api";

export type OpenCodeWindow = {
  status: string;
  percent: number;
  resetsAt: string;
  limitDollars: number;
  usedDollars: number;
};

export type OpenCodeStatus = {
  status: string;
  plan: string;
  subscribed: boolean;
  rolling: OpenCodeWindow | null;
  weekly: OpenCodeWindow | null;
  monthly: OpenCodeWindow | null;
  error?: string;
  code?: string;
};

export function useOpenCodeStatus() {
  const [data, setData] = useState<OpenCodeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { serverUrl, token } = readSettings();
    if (!serverUrl || !token) {
      setError("Configure Server URL e HOK_TOKEN nas Configurações.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, "")}/opencode/status`, {
        headers: { "X-Hok-Token": token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (json as OpenCodeStatus).error || `HTTP ${res.status}`;
        setError(msg);
        setData(null);
        return;
      }
      setData(json as OpenCodeStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}