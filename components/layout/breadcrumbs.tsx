import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SITE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className={cn("text-sm", className)}>
        <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 ? (
                  <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
                ) : null}
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="truncate hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={cn("truncate", isLast && "font-medium text-charcoal")}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
