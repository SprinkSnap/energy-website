import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/energy-compliant-design-logo.png";
const ICON_SRC = "/logo-icon.png";
const LOGO_WIDTH = 1536;
const LOGO_HEIGHT = 541;

type LogoLayout = "auto" | "full" | "icon";
type LogoSize = "sm" | "md" | "lg" | "responsive";

interface BrandLogoProps {
  variant?: "dark" | "light";
  layout?: LogoLayout;
  size?: LogoSize;
  className?: string;
  imageClassName?: string;
  href?: string | null;
  /** @deprecated Use `layout="icon"` instead. */
  showWordmark?: boolean;
  /** @deprecated Use `imageClassName` instead. */
  iconClassName?: string;
}

const wordmarkSizeClasses: Record<LogoSize, string> = {
  sm: "h-8 w-auto max-w-[9.5rem] object-contain sm:max-w-[11rem]",
  md: "h-9 w-auto max-w-[11rem] object-contain sm:h-10 sm:max-w-[13rem] md:h-11 md:max-w-[15rem]",
  lg: "h-10 w-auto max-w-[12rem] object-contain sm:h-11 sm:max-w-[14rem] md:h-12 md:max-w-[16rem] lg:h-14 lg:max-w-none",
  responsive:
    "h-8 w-auto max-w-[10rem] object-contain sm:h-9 sm:max-w-[12rem] md:h-10 md:max-w-[14rem] lg:h-11 lg:max-w-[17rem] xl:h-12 xl:max-w-none",
};

const iconSizeClasses: Record<LogoSize, string> = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-9 w-9 rounded-lg sm:h-10 sm:w-10",
  lg: "h-10 w-10 rounded-xl sm:h-11 sm:w-11",
  responsive: "h-8 w-8 rounded-lg sm:h-9 sm:w-9 md:h-10 md:w-10",
};

const imageSizes: Record<LogoSize, string> = {
  sm: "(max-width: 640px) 152px, 176px",
  md: "(max-width: 640px) 176px, (max-width: 768px) 208px, 240px",
  lg: "(max-width: 640px) 192px, (max-width: 768px) 224px, (max-width: 1024px) 256px, 320px",
  responsive:
    "(max-width: 640px) 160px, (max-width: 768px) 192px, (max-width: 1024px) 224px, (max-width: 1280px) 272px, 320px",
};

export function BrandLogo({
  layout,
  size = "responsive",
  className,
  imageClassName,
  iconClassName,
  href = "/",
  showWordmark,
}: BrandLogoProps) {
  const resolvedLayout =
    layout ?? (showWordmark === false ? "icon" : showWordmark === true ? "full" : "auto");

  const wordmark = (
    <Image
      src={LOGO_SRC}
      alt="Energy Compliant Design"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      sizes={imageSizes[size]}
      className={cn(
        wordmarkSizeClasses[size],
        resolvedLayout === "auto" && "hidden sm:inline-block",
        imageClassName,
        iconClassName,
      )}
      priority
    />
  );

  const icon = (
    <Image
      src={ICON_SRC}
      alt="Energy Compliant Design"
      width={256}
      height={256}
      className={cn(
        iconSizeClasses[size],
        resolvedLayout === "auto" && "sm:hidden",
        resolvedLayout === "full" && "hidden",
        imageClassName,
        iconClassName,
      )}
      priority
    />
  );

  const content = (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {(resolvedLayout === "auto" || resolvedLayout === "icon") && icon}
      {(resolvedLayout === "auto" || resolvedLayout === "full") && wordmark}
      {resolvedLayout === "icon" ? (
        <span className="sr-only">Energy Compliant Design</span>
      ) : null}
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
    >
      {content}
    </Link>
  );
}
