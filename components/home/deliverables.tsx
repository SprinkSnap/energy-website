import { CheckCircle2 } from "lucide-react";
import { DELIVERABLES } from "@/lib/constants";

export function HomeDeliverables() {
  return (
    <section className="border-b border-border bg-muted/35 py-10 sm:py-12" aria-labelledby="deliverables-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="deliverables-heading" className="text-xl font-bold text-charcoal sm:text-2xl">
          What you receive
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          A coordinated permit package — not disconnected files. Each deliverable
          is prepared from the same modelled project data.
        </p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {DELIVERABLES.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-charcoal"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-green" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
