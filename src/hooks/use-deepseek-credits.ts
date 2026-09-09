"use client";
import { useCallback, useEffect, useState } from "react";
import { readSettings } from "@/lib/hok-api";

export type DeepSeekCredits = {
  balance: string;
  currency: string;
  granted_balance: string;
  topped_up_balance: string;
  is_available: boolean;
  source: string;
};

export function useDeepSeekCredits() {
  const [data, setData] = useState<DeepSeekCredits | null>(null);
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
      const res = await fetch(`${serverUrl.replace(/\/$/, "")}/deepseek/credits`, {
        headers: { "X-Hok-Token": token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json as DeepSeekCredits);
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