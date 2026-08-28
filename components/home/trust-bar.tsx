export function HomeTrustBar() {
  const items = [
    "Ontario residential",
    "HOT2000 modelling",
    "SB-12 compliance",
    "EEDS for permit",
    "48-hour delivery",
  ];

  return (
    <section className="border-y border-border bg-white" aria-label="Service highlights">
      <div className="mx-auto max-w-7xl overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <ul className="flex min-w-max items-center justify-start gap-3 sm:min-w-0 sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-2 lg:justify-between">
          {items.map((item) => (
            <li
              key={item}
              className="shrink-0 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase sm:text-xs sm:tracking-[0.16em]"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
