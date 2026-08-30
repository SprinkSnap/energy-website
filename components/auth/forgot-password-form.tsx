"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { LogoWatermark } from "@/components/brand/watermark";
import { Field, fieldControlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const schema = z.object({
  email: z.string().email("Enter a valid email."),
});

type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const { resetPassword } = useAuth();
  const [formError, setFormError] = useState<string>();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setFormError(undefined);
    const result = await resetPassword(values.email);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSent(true);
    toast.success("Password reset email sent.");
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.04),0_18px_48px_rgba(11,18,32,0.08)] sm:p-8">
      <LogoWatermark opacity={0.04} blend="normal" />
      <div className="relative">
        <BrandLogo layout="full" size="lg" className="justify-center" />
        <h1 className="mt-6 text-2xl font-bold text-charcoal">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSupabaseConfigured()
            ? "We will email you a secure link to choose a new password."
            : "Password reset requires Supabase. Contact support if you need help."}
        </p>

        {sent ? (
          <div className="mt-6 rounded-2xl border border-brand-green/20 bg-brand-green/5 p-4 text-sm leading-6 text-charcoal">
            <p className="flex items-start gap-2 font-medium">
              <Mail className="mt-0.5 size-4 shrink-0 text-brand-green" aria-hidden />
              Check your inbox for the reset link.
            </p>
            <p className="mt-2 text-muted-foreground">
              The link returns you to the login page once your password is updated.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 grid gap-4">
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                className={fieldControlClass}
                autoComplete="email"
                placeholder="you@company.com"
                {...register("email")}
              />
            </Field>
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <Button
              type="submit"
              variant="brand"
              size="lg"
              className="min-h-11"
              disabled={isSubmitting || !isSupabaseConfigured()}
            >
              {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <p className="mt-4 text-sm">
          <Link className="font-medium text-electric hover:underline" href="/login">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
