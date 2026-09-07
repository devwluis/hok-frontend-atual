"use client";
import { useState } from "react";
import { RefreshCw, MonitorPlay, AlertTriangle } from "lucide-react";
import { ScreenFrame, ScreenHeader, Card } from "@/components/shell/ScreenFrame";

const PREVIEW_KEY = "hokma.preview.url.v1";
const DEFAULT_PREVIEW_URL = "/preview/vnc_lite.html";

// URL alvo do iframe. Usa caminho relativo (mesma origem) para passar
// pelo proxy /preview/ do nginx -> websockify 6080. Para trocar depois,
// basta editar o campo na própria tela (persistido em localStorage).
function loadPreviewUrl(): string {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    if (!raw) return DEFAULT_PREVIEW_URL;
    const parsed = JSON.parse(raw) as { url?: string };
    return parsed?.url || DEFAULT_PREVIEW_URL;
  } catch {
    return DEFAULT_PREVIEW_URL;
  }
}

function persistPreviewUrl(url: string) {
  localStorage.setItem(PREVIEW_KEY, JSON.stringify({ url }));
}

export function PreviewScreen() {
  const [url, setUrl] = useState<string>(loadPreviewUrl);
  const [src, setSrc] = useState<string>(loadPreviewUrl);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleApply = () => {
    persistPreviewUrl(url.trim());
    setSrc(url.trim());
    setLoaded(false);
    setError(false);
  };

  const handleReload = () => {
    setLoaded(false);
    setError(false);
    // força recarga trocando o key do iframe
    setSrc((prev) => (prev.includes("?") ? `${prev}&_r=${Date.now()}` : `${prev}?_r=${Date.now()}`));
  };

  return (
    <ScreenFrame>
      <ScreenHeader title="Preview" subtitle="Visualização embutida da tela (ex.: noVNC localhost:6080)." />

      <Card className="mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color:var(--amber)]/15 text-[color:var(--amber)]">
            <MonitorPlay className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">URL do Preview</div>
            <div className="text-[11px] text-muted-foreground">Carregada dentro do iframe (mesma origem VPS).</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_PREVIEW_URL}
            className="w-full flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--amber)] focus:shadow-[var(--shadow-amber-glow)]"
            data-testid="input-preview-url"
          />
          <button
            onClick={handleApply}
            data-testid="button-preview-apply"
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[color:var(--amber)] px-3 py-2 text-sm font-semibold text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)] hover:opacity-95 transition-opacity"
          >
            Aplicar
          </button>
          <button
            onClick={handleReload}
            data-testid="button-preview-reload"
            className="flex shrink-0 items-center justify-center rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Recarregar iframe"
            title="Recarregar iframe"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </Card>

      {/* Erro de carregamento */}
      {error && (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Não foi possível carregar o Preview</div>
            <div className="mt-0.5 text-[12px] opacity-90">
              Verifique se o serviço alvo está no ar e se a URL é acessível a partir deste servidor.
            </div>
          </div>
          <button onClick={handleReload} className="shrink-0 text-[11px] underline">Tentar novamente</button>
        </div>
      )}

      {/* iframe do preview */}
      <div
        data-testid="preview-frame-container"
        className="relative h-[calc(100dvh-320px)] min-h-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-window)]"
      >
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-[color:var(--amber)]" />
          </div>
        )}
        <iframe
          key={src}
          src={src}
          onLoad={() => { setLoaded(true); setError(false); }}
          onError={() => { setError(true); setLoaded(false); }}
          title="Preview da tela"
          className="h-full w-full border-0 bg-white"
          referrerPolicy="no-referrer"
        />
      </div>
    </ScreenFrame>
  );
}