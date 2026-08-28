import { WIZARD_FLOW_STEPS, type WizardStepId } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function WizardProgress({
  current,
  onSelect,
}: {
  current: WizardStepId;
  onSelect?: (step: WizardStepId) => void;
}) {
  const index = WIZARD_FLOW_STEPS.findIndex((step) => step.id === current);
  const currentIndex = index < 0 ? 0 : index;

  return (
    <div className="border-b border-border bg-white">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <p className="text-sm font-medium text-charcoal lg:hidden">
          Step {currentIndex + 1} of {WIZARD_FLOW_STEPS.length} —{" "}
          {WIZARD_FLOW_STEPS[currentIndex]?.label}
        </p>
        <ol className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:mt-0 lg:grid lg:grid-cols-8 lg:gap-2 lg:overflow-visible lg:pb-0">
          {WIZARD_FLOW_STEPS.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            const clickable = Boolean(onSelect && (done || active));
            const content = (
              <>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]",
                    active && "bg-electric text-white",
                    done && "bg-brand-green text-white",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="hidden truncate sm:inline">{step.label}</span>
              </>
            );
            return (
              <li key={step.id}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onSelect?.(step.id)}
                    className={cn(
                      "flex w-full min-w-[4.5rem] items-center gap-2 rounded-full px-2 py-1 text-left text-[11px] font-semibold tracking-wide uppercase",
                      active && "bg-electric-soft text-electric",
                      done && "text-brand-green-dark hover:bg-brand-green-soft",
                    )}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    className={cn(
                      "flex min-w-[4.5rem] items-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold tracking-wide uppercase",
                      !active && !done && "text-muted-foreground",
                    )}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
