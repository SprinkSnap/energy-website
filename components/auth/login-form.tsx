"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlayCircle, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { LogoWatermark } from "@/components/brand/watermark";
import { Field, fieldControlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { isDemoAuthEnabled } from "@/lib/auth-config";

const schema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/portal";
  const { login, loginDemo } = useAuth();
  const [formError, setFormError] = useState<string>();
  const [demoLoading, setDemoLoading] = useState(false);
  const demoEnabled = isDemoAuthEnabled();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const handleDemoLogin = async () => {
    setFormError(undefined);
    setDemoLoading(true);
    const result = await loginDemo();
    setDemoLoading(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success("Welcome to the demo portal.");
    router.push(nextPath);
  };

  const onSubmit = async (values: Values) => {
    setFormError(undefined);
    const result = await login(values.email, values.password);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success("Welcome back.");
    router.push(nextPath);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.04),0_18px_48px_rgba(11,18,32,0.08)] sm:p-8">
      <LogoWatermark opacity={0.04} blend="normal" />
      <div className="relative">
        <BrandLogo layout="full" size="lg" className="justify-center" />
        <h1 className="mt-6 text-2xl font-bold text-charcoal">Log in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Access your projects, proposals, and documents.
        </p>

        {demoEnabled ? (
          <div className="mt-6 rounded-2xl border border-electric/20 bg-electric-soft/60 p-4 sm:p-5">
            <p className="text-sm font-semibold text-charcoal">Try the client portal</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Explore sample SB-12 projects, proposals, and documents — no email or password
              required.
            </p>
            <Button
              type="button"
              variant="brand"
              size="lg"
              className="mt-4 min-h-11 w-full"
              disabled={demoLoading || isSubmitting}
              onClick={handleDemoLogin}
            >
              <PlayCircle className="size-5" aria-hidden />
              {demoLoading ? "Opening demo…" : "Open demo portal"}
            </Button>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-green" aria-hidden />
              Prototype demo with sample projects. Not for real client data.
            </p>
          </div>
        ) : null}

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-border" />
          </div>
          <p className="relative mx-auto w-fit bg-white px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Or sign in with your account
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
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
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              className={fieldControlClass}
              autoComplete="current-password"
              {...register("password")}
            />
          </Field>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" variant="outline" size="lg" className="min-h-11" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Log in"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-sm">
          <Link className="text-electric hover:underline" href="/forgot-password">
            Forgot password?
          </Link>
          <p>
            Need an account?{" "}
            <Link className="font-medium text-electric hover:underline" href="/quote">
              Request a quote
            </Link>
            {" · "}
            <Link className="font-medium text-electric hover:underline" href="/create-account">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
