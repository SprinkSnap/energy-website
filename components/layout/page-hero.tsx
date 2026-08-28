import { LogoWatermark } from "@/components/brand/watermark";

export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-charcoal px-4 py-16 text-white sm:px-6 lg:px-8">
      <div className="bg-hero-mesh absolute inset-0 opacity-70" />
      <LogoWatermark opacity={0.08} />
      <div className="relative mx-auto max-w-7xl">
        {eyebrow ? (
          <p className="text-xs font-semibold tracking-[0.2em] text-electric uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">{description}</p>
        ) : null}
      </div>
    </section>
  );
}
