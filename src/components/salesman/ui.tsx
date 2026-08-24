"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

/** Consistent page chrome for salesman views */
export function SalesmanPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-8", className)}>{children}</div>;
}

export function SalesmanPageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumb.map((item, i) => (
              <React.Fragment key={item.label}>
                {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                {item.href ? (
                  <Link href={item.href} className="hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium">{item.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function MetricStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: string | number;
    hint?: string;
    variant?: "default" | "success" | "warning" | "danger";
  }>;
}) {
  const dot = {
    default: "bg-slate-400",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
  };

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-card px-4 py-3.5">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", dot[item.variant ?? "default"])} />
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {item.label}
            </p>
          </div>
          <p className="text-lg font-semibold tabular-nums text-foreground">{item.value}</p>
          {item.hint && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{item.hint}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  badge,
  toolbar,
  children,
  className,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {badge}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {toolbar && <div className="shrink-0">{toolbar}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Compact inline switch — minimal height, count suffixes, per-tab active colors */
export function CompactSegmentedSwitch<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{
    value: T;
    label: string;
    count?: string;
    tone?: "blue" | "green" | "red";
  }>;
  className?: string;
}) {
  const activeToneStyles = {
    blue: "bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/40",
    green: "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/40",
    red: "bg-red-600 text-white shadow-sm ring-1 ring-red-500/40",
  };

  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex h-7 items-center rounded-md border border-border/60 bg-muted/25 p-0.5",
        className
      )}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        const tone = option.tone ?? "blue";
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-[5px] px-2.5 text-[11px] font-medium transition-all",
              isActive
                ? activeToneStyles[tone]
                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
            )}
          >
            {option.label}
            {option.count && (
              <span
                className={cn(
                  "tabular-nums text-[10px] font-normal",
                  isActive ? "text-white/85" : "text-muted-foreground/60"
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function QuickLinkCard({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="rounded-lg bg-primary/8 p-2.5 text-primary group-hover:bg-primary/12 transition-colors">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary mt-0.5 shrink-0" />
    </Link>
  );
}

export function WorkflowHint({
  steps,
}: {
  steps: Array<{ label: string; detail: string }>;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <p className="text-xs font-semibold text-foreground mb-2">Quick guide</p>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={step.label} className="flex gap-2.5 text-xs text-muted-foreground">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background border text-[10px] font-semibold text-foreground">
              {i + 1}
            </span>
            <span>
              <span className="font-medium text-foreground">{step.label}</span>
              {" — "}
              {step.detail}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
