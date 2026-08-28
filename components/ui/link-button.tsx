import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type ButtonVariant = VariantProps<typeof buttonVariants>;

export function LinkButton({
  href,
  children,
  className,
  variant,
  size,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
} & ButtonVariant) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size, className }))}
    >
      {children}
    </Link>
  );
}

export { Button };
