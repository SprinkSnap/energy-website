"use client";

import { cn } from "@/lib/utils";

export function OptionCard({
  selected,
  title,
  eyebrow,
  children,
  onSelect,
  actionLabel = "Select this route",
  bestFor,
  need,
  time,
}: {
  selected?: boolean;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  onSelect: () => void;
  actionLabel?: string;
  bestFor?: string;
  need?: string;
  time?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-white p-6 text-left shadow-[0_1px_2px_rgba(11,18,32,0.04),0_12px_32px_rgba(11,18,32,0.05)] transition-all hover:shadow-md focus-visible:ring-3 focus-visible:ring-electric/40",
        selected ? "border-electric ring-2 ring-electric/25" : "border-border",
      )}
    >
      {eyebrow ? (
        <span className="text-xs font-semibold tracking-wider text-electric uppercase">
          {eyebrow}
        </span>
      ) : null}
      <h3 className="mt-1 text-lg font-semibold text-charcoal">{title}</h3>
      <div className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{children}</div>
      {bestFor || need || time ? (
        <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
          {bestFor ? (
            <div>
              <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Best for
              </dt>
              <dd className="mt-0.5 text-charcoal">{bestFor}</dd>
            </div>
          ) : null}
          {need ? (
            <div>
              <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                You’ll need
              </dt>
              <dd className="mt-0.5 text-charcoal">{need}</dd>
            </div>
          ) : null}
          {time ? (
            <div>
              <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Timing
              </dt>
              <dd className="mt-0.5 text-charcoal">{time}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <span
        className={cn(
          "mt-5 inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium",
          selected ? "bg-electric text-white" : "bg-muted text-charcoal",
        )}
      >
        {selected ? "Selected" : actionLabel}
      </span>
    </button>
  );
}

export function ChoiceRow({
  checked,
  onChange,
  children,
  name,
  type = "checkbox",
  value,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  name: string;
  type?: "checkbox" | "radio";
  value?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-4 py-3.5 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-electric/40",
        checked ? "border-electric bg-electric-soft/60" : "border-border hover:border-electric/40",
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 accent-[#1B8CFF]"
      />
      <span className="leading-6 text-charcoal">{children}</span>
    </label>
  );
}
