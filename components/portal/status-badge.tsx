import { Badge } from "@/components/ui/badge";
import { PAYMENT_LABEL, STATUS_LABEL, statusTone } from "@/lib/format";
import type { PaymentStatus, ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const toneClass: Record<ReturnType<typeof statusTone>, string> = {
  default: "bg-electric-soft text-electric border-transparent",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border-border text-muted-foreground",
  success: "bg-brand-green-soft text-brand-green-dark border-transparent",
  warning: "bg-amber-50 text-amber-800 border-transparent",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant="outline" className={cn("h-6 px-2.5", toneClass[statusTone(status)])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PaymentBadge({ payment }: { payment: PaymentStatus }) {
  const className =
    payment === "paid-in-full"
      ? "bg-brand-green-soft text-brand-green-dark border-transparent"
      : payment === "deposit-paid"
        ? "bg-electric-soft text-electric-dark border-transparent"
        : "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("h-6 px-2.5", className)}>
      {PAYMENT_LABEL[payment]}
    </Badge>
  );
}
