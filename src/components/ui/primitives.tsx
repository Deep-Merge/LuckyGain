import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("panel p-5", className)}>{children}</section>;
}

export function PanelTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-display text-[15px] font-semibold tracking-tight text-charcoal">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Money({
  cents,
  tone = "default",
  signed = false,
  currency = "USD",
  className,
}: {
  cents: number;
  tone?: "default" | "income" | "expense" | "gold" | "muted";
  signed?: boolean;
  currency?: "USD" | "CNY";
  className?: string;
}) {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat(
    currency === "CNY" ? "zh-CN" : "en-US",
    {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    },
  ).format(abs / 100);

  let prefix = "";
  if (signed) {
    if (cents > 0) prefix = "+";
    if (cents < 0) prefix = "−";
  } else if (cents < 0) {
    prefix = "−";
  }

  return (
    <span
      className={cn(
        "tabular tracking-tight",
        tone === "income" && "text-emerald",
        tone === "expense" && "text-coral",
        tone === "gold" && "text-gold-dark",
        tone === "muted" && "text-muted",
        tone === "default" && "text-charcoal-soft",
        className,
      )}
    >
      {prefix}
      {formatted}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "success" | "warn" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        tone === "neutral" && "bg-ivory-deep text-muted",
        tone === "gold" && "bg-gold-soft/70 text-gold-dark",
        tone === "success" && "bg-emerald-soft text-emerald",
        tone === "warn" && "bg-amber-soft text-amber",
        tone === "danger" && "bg-coral-soft text-coral",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <h3 className="font-display text-lg font-semibold text-charcoal">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  );
}
