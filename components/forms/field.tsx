import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-charcoal">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const fieldControlClass =
  "h-12 w-full rounded-xl border border-border bg-white px-3.5 text-sm text-charcoal shadow-[0_1px_2px_rgba(11,18,32,0.04)] outline-none transition-colors placeholder:text-muted-foreground/80 hover:border-electric/40 focus-visible:border-electric focus-visible:ring-3 focus-visible:ring-electric/20 disabled:cursor-not-allowed disabled:opacity-50";

export function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select className={cn(fieldControlClass, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}
