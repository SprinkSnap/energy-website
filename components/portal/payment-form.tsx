"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Field, fieldControlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoWatermark } from "@/components/brand/watermark";

const schema = z.object({
  name: z.string().min(2),
  number: z.string().min(12, "Enter a card number."),
  expiry: z.string().min(4),
  cvc: z.string().min(3),
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
      <div className="relative rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-charcoal">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Amount due: {amountLabel}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Placeholder payment UI. Connect Stripe or another processor before collecting live payments.
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
            <Input id="name" className={fieldControlClass} {...register("name")} />
          </Field>
          <Field label="Card number" htmlFor="number" error={errors.number?.message}>
            <Input id="number" inputMode="numeric" className={fieldControlClass} placeholder="4242 4242 4242 4242" {...register("number")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Expiry" htmlFor="expiry" error={errors.expiry?.message}>
              <Input id="expiry" className={fieldControlClass} placeholder="MM/YY" {...register("expiry")} />
            </Field>
            <Field label="CVC" htmlFor="cvc" error={errors.cvc?.message}>
              <Input id="cvc" className={fieldControlClass} placeholder="123" {...register("cvc")} />
            </Field>
          </div>
          <Button type="submit" variant="brand" size="lg" disabled={isSubmitting || done}>
            {isSubmitting ? "Processing…" : title}
          </Button>
        </form>
      </div>
    </div>
  );
}
