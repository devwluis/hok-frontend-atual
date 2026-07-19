import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Provides scrollable area with bottom padding so the dock never overlaps content. */
export function ScreenFrame({
  children,
  className,
  noPad,
}: {
  children: ReactNode;
  className?: string;
  noPad?: boolean;
}) {
  return (
    <div className={cn("h-full overflow-y-auto thin-scroll", className)}>
      <div className={cn(noPad ? "" : "px-4 pt-4", "pb-[120px]")}>{children}</div>
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-2">
      <div>
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-window)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[color:var(--amber)] bg-[color:var(--amber)]/15 text-[color:var(--amber)]"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function AmberButton({
  children,
  onClick,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--amber)] px-5 py-3 text-sm font-semibold text-[color:var(--amber-foreground)] shadow-[var(--shadow-amber-glow)] transition hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
    >
      {children}
    </button>
  );
}
