"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Field, fieldControlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoWatermark } from "@/components/brand/watermark";

const schema = z.object({
  name: z.string().min(2, "Enter the name on the card."),
  number: z.string().min(12, "Enter a card number."),
  expiry: z.string().min(4, "Enter expiry as MM/YY."),
  cvc: z.string().min(3, "Enter the CVC."),
});

export function PaymentForm({
  title,
  amountLabel,
  successHref,
  successMessage,
  onSuccess,
}: {
  title: string;
  amountLabel: string;
  successHref: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  return (
    <div className="relative mx-auto max-w-md px-4 py-12">
      <LogoWatermark opacity={0.05} />
      <div className="relative rounded-3xl border border-border/80 bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.04),0_18px_48px_rgba(11,18,32,0.08)] sm:p-8">
        <h1 className="text-2xl font-bold text-charcoal">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Amount due: {amountLabel}</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-green-soft px-3 py-1 text-xs font-medium text-brand-green-dark">
          <Lock className="size-3.5" aria-hidden />
          Secure payment · test mode
        </p>
        <form
          className="mt-6 grid gap-4"
          onSubmit={handleSubmit(async () => {
            await new Promise((r) => setTimeout(r, 600));
            onSuccess();
            setDone(true);
            toast.success(successMessage);
            router.push(successHref);
          })}
        >
          <Field label="Name on card" htmlFor="name" error={errors.name?.message}>
            <Input id="name" className={fieldControlClass} autoComplete="cc-name" {...register("name")} />
          </Field>
          <Field label="Card number" htmlFor="number" error={errors.number?.message}>
            <Input
              id="number"
              inputMode="numeric"
              className={fieldControlClass}
              placeholder="4242 4242 4242 4242"
              autoComplete="cc-number"
              {...register("number")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Expiry" htmlFor="expiry" error={errors.expiry?.message}>
              <Input id="expiry" className={fieldControlClass} placeholder="MM/YY" autoComplete="cc-exp" {...register("expiry")} />
            </Field>
            <Field label="CVC" htmlFor="cvc" error={errors.cvc?.message}>
              <Input id="cvc" className={fieldControlClass} placeholder="123" autoComplete="cc-csc" {...register("cvc")} />
            </Field>
          </div>
          <Button type="submit" variant="brand" size="lg" disabled={isSubmitting || done}>
            {isSubmitting ? "Processing…" : title}
          </Button>
        </form>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Test cards only. Live processing is connected before collecting real
          payments. Permit documents stay locked until the remaining balance is paid.
        </p>
      </div>
    </div>
  );
}
