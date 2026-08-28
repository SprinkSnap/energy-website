"use client";

import Link from "next/link";
import type { AnalyticsEvent } from "@/lib/analytics";
import { trackEvent } from "@/lib/analytics";
import { buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type ButtonVariant = VariantProps<typeof buttonVariants>;

export function TrackedLinkButton({
  href,
  children,
  className,
  variant,
  size,
  event,
  eventProperties,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  event?: AnalyticsEvent;
  eventProperties?: Record<string, string>;
} & ButtonVariant) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={() => {
        if (event) trackEvent(event, { href, ...eventProperties });
      }}
    >
      {children}
    </Link>
  );
}

export function TrackedLink({
  href,
  children,
  className,
  event,
  eventProperties,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  event?: AnalyticsEvent;
  eventProperties?: Record<string, string>;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (event) trackEvent(event, { href, ...eventProperties });
      }}
    >
      {children}
    </Link>
  );
}
