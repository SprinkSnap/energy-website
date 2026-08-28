import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-28 w-full rounded-xl border border-border bg-white px-3.5 py-3 text-base text-charcoal shadow-[0_1px_2px_rgba(11,18,32,0.04)] transition-colors outline-none placeholder:text-muted-foreground/80 hover:border-electric/40 focus-visible:border-electric focus-visible:ring-3 focus-visible:ring-electric/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
