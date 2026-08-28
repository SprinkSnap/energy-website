import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  variant?: "dark" | "light";
  showWordmark?: boolean;
  className?: string;
  iconClassName?: string;
  href?: string | null;
}

export function BrandLogo({
  showWordmark = true,
  className,
  iconClassName,
  href = "/",
}: BrandLogoProps) {
  const content = showWordmark ? (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/branding/energy-compliant-design-logo.png"
        alt="Energy Compliant Design"
        width={1536}
        height={541}
        className={cn("h-10 w-auto rounded-md sm:h-11", iconClassName)}
        priority
      />
    </span>
  ) : (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/logo-icon.png"
        alt="Energy Compliant Design"
        width={40}
        height={40}
        className={cn("h-10 w-10 rounded-xl", iconClassName)}
        priority
      />
      <span className="sr-only">Energy Compliant Design</span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric">
      {content}
    </Link>
  );
}
