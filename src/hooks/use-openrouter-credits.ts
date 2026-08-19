"use client";
import { useCallback, useEffect, useState } from "react";
import { readSettings } from "@/lib/hok-api";

export type OpenRouterCredits = {
  usage_monthly: number;
  usage_daily: number;
  usage_weekly: number;
  usage_total: number;
  limit: number | null;
  limit_remaining: number | null;
  total_credits?: number;
  total_usage?: number;
  balance?: number;
};

export function useOpenRouterCredits() {
  const [data, setData] = useState<OpenRouterCredits | null>(null);
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
      const res = await fetch(`${serverUrl.replace(/\/$/, "")}/openrouter/credits`, {
        headers: { "X-Hok-Token": token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json as OpenRouterCredits);
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