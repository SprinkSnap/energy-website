const processSteps = [
  {
    n: "01",
    title: "Upload drawings",
    body: "Create an account and upload architectural PDFs through the client portal.",
  },
  {
    n: "02",
    title: "Confirm specifications",
    body: "Confirm envelope assemblies, glazing, and mechanical selections in the wizard.",
  },
  {
    n: "03",
    title: "Approve proposal & deposit",
    body: "Review a fixed quote. A 50% deposit starts the modelling work.",
  },
  {
    n: "04",
    title: "Download permit package",
    body: "EEDS, HOT2000 reports, and supporting documents after final payment.",
  },
];

export function HomeProcess() {
  return (
    <section className="bg-white py-12 sm:py-16 lg:py-20" aria-labelledby="process-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold tracking-wide text-electric uppercase">How it works</p>
        <h2
          id="process-heading"
          className="mt-2 max-w-2xl text-2xl font-bold text-charcoal sm:text-3xl"
        >
          Four steps from drawings to a permit-ready package
        </h2>

        {/* Compact mobile timeline */}
        <ol className="mt-6 space-y-0 md:hidden">
          {processSteps.map((step, index) => (
            <li key={step.n} className="relative flex gap-3 pb-5 last:pb-0">
              {index < processSteps.length - 1 ? (
                <span
                  className="absolute top-8 left-[0.9rem] h-[calc(100%-1.25rem)] w-px bg-border"
                  aria-hidden
                />
              ) : null}
              <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-electric-soft text-[0.65rem] font-bold text-electric">
                {step.n}
              </span>
              <div className="min-w-0 pt-0.5">
                <h3 className="text-sm font-semibold text-charcoal">{step.title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Tablet/desktop cards */}
        <div className="mt-8 hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
          {processSteps.map((step) => (
            <article key={step.n} className="surface-card p-5 lg:p-6">
              <p className="text-xs font-semibold tracking-[0.18em] text-electric uppercase">
                {step.n}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-charcoal">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
