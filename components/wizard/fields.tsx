"use client";

import { cn } from "@/lib/utils";

export function OptionCard({
  selected,
  title,
  eyebrow,
  children,
  onSelect,
  actionLabel = "Select this route",
}: {
  selected?: boolean;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  onSelect: () => void;
  actionLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-white p-6 text-left shadow-sm transition-all hover:shadow-md focus-visible:ring-3 focus-visible:ring-electric/40",
        selected ? "border-electric ring-2 ring-electric/30" : "border-border",
      )}
    >
      {eyebrow ? (
        <span className="text-xs font-semibold tracking-wider text-electric uppercase">{eyebrow}</span>
      ) : null}
      <h3 className="mt-1 text-lg font-semibold text-charcoal">{title}</h3>
      <div className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{children}</div>
      <span className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-electric px-4 text-sm font-medium text-white">
        {actionLabel}
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
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-electric/40">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 accent-[#1B8CFF]"
      />
      <span>{children}</span>
    </label>
  );
}
