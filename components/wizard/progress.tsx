import { WIZARD_STEPS, type WizardStepId } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function WizardProgress({ current }: { current: WizardStepId }) {
  const index = WIZARD_STEPS.findIndex((step) => step.id === current);
  const currentIndex = index < 0 ? 1 : index;

  return (
    <div className="border-b border-border bg-white">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <p className="text-sm font-medium text-charcoal lg:hidden">
          Step {currentIndex + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[currentIndex]?.label}
        </p>
        <ol className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:mt-0 lg:grid lg:grid-cols-9 lg:gap-2 lg:overflow-visible lg:pb-0">
          {WIZARD_STEPS.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <li
                key={step.id}
                className={cn(
                  "flex min-w-[4.5rem] flex-1 items-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold tracking-wide uppercase",
                  active && "bg-electric-soft text-electric",
                  done && "text-brand-green-dark",
                  !active && !done && "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]",
                    active && "bg-electric text-white",
                    done && "bg-brand-green text-white",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="hidden truncate sm:inline">{step.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
