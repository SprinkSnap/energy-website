import Image from "next/image";
import { cn } from "@/lib/utils";

export function LogoWatermark({
  className,
  opacity = 0.14,
  blend = "screen",
}: {
  className?: string;
  opacity?: number;
  blend?: "screen" | "normal";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <Image
        src="/logo-icon.png"
        alt=""
        width={640}
        height={640}
        className={cn(
          "absolute -right-10 -top-8 h-[22rem] w-[22rem] select-none md:-right-4 md:h-[28rem] md:w-[28rem]",
          blend === "screen" && "mix-blend-screen",
        )}
        style={{ opacity }}
      />
    </div>
  );
}
