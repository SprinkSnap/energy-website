import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/energy-compliant-design-logo.png";
const ICON_SRC = "/logo-icon.png";
const LOGO_WIDTH = 2087;
const LOGO_HEIGHT = 753;

type LogoLayout = "auto" | "compact" | "full" | "icon";
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

/** Wordmark scales by viewport: mobile → tablet → desktop. */
const wordmarkSizeClasses: Record<LogoSize, string> = {
  sm: [
    "h-7 w-auto max-w-[9rem] object-contain",
    "sm:h-8 sm:max-w-[10.5rem]",
    "md:h-9",
  ].join(" "),
  md: [
    "h-8 w-auto max-w-[10rem] object-contain",
    "sm:h-9 sm:max-w-[11.5rem]",
    "md:h-10 md:max-w-[13rem]",
    "lg:h-11 lg:max-w-[15rem]",
  ].join(" "),
  lg: [
    "h-9 w-auto max-w-[11rem] object-contain",
    "sm:h-10 sm:max-w-[12.5rem]",
    "md:h-11 md:max-w-[14rem]",
    "lg:h-12 lg:max-w-[16rem]",
    "xl:h-14 xl:max-w-none",
  ].join(" "),
  responsive: [
    "h-7 w-auto max-w-[9rem] object-contain",
    "sm:h-8 sm:max-w-[10.5rem]",
    "md:h-9 md:max-w-[12rem]",
    "lg:h-10 lg:max-w-[14rem]",
    "xl:h-11 xl:max-w-[16rem]",
    "2xl:h-12 2xl:max-w-none",
  ].join(" "),
};

const iconSizeClasses: Record<LogoSize, string> = {
  sm: "h-7 w-7 rounded-lg sm:h-8 sm:w-8",
  md: "h-8 w-8 rounded-lg sm:h-9 sm:w-9 md:h-10 md:w-10",
  lg: "h-9 w-9 rounded-xl sm:h-10 sm:w-10 md:h-11 md:w-11",
  responsive: "h-7 w-7 rounded-lg sm:h-8 sm:w-8 md:h-9 md:w-9 lg:h-10 lg:w-10",
};

const imageSizes: Record<LogoSize, string> = {
  sm: "(max-width: 640px) 144px, (max-width: 768px) 168px, 180px",
  md: "(max-width: 640px) 160px, (max-width: 768px) 184px, (max-width: 1024px) 208px, 240px",
  lg: "(max-width: 640px) 176px, (max-width: 768px) 200px, (max-width: 1024px) 224px, (max-width: 1280px) 256px, 320px",
  responsive:
    "(max-width: 640px) 144px, (max-width: 768px) 168px, (max-width: 1024px) 192px, (max-width: 1280px) 224px, 288px",
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
      alt=""
      aria-hidden
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      sizes={imageSizes[size]}
      quality={90}
      className={cn(
        wordmarkSizeClasses[size],
        (resolvedLayout === "auto" || resolvedLayout === "compact") && "hidden sm:inline-block",
        imageClassName,
        iconClassName,
      )}
      priority
    />
  );

  const compactLabel = (
    <span
      className={cn(
        "max-w-[9.5rem] truncate text-xs leading-tight font-semibold text-white sm:hidden",
        resolvedLayout !== "compact" && "hidden",
      )}
    >
      Energy Compliant Design
    </span>
  );

  const icon = (
    <Image
      src={ICON_SRC}
      alt=""
      aria-hidden
      width={256}
      height={256}
      className={cn(
        iconSizeClasses[size],
        (resolvedLayout === "auto" || resolvedLayout === "compact") && "sm:hidden",
        resolvedLayout === "full" && "hidden",
        imageClassName,
        iconClassName,
      )}
      priority
    />
  );

  const content = (
    <span className={cn("inline-flex shrink-0 items-center gap-2", className)}>
      {(resolvedLayout === "auto" || resolvedLayout === "icon" || resolvedLayout === "compact") &&
        icon}
      {resolvedLayout === "compact" && compactLabel}
      {(resolvedLayout === "auto" || resolvedLayout === "full") && wordmark}
      {resolvedLayout === "icon" || resolvedLayout === "compact" ? (
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
