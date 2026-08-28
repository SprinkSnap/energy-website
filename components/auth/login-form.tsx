"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand/logo";
import { LogoWatermark } from "@/components/brand/watermark";
import { Field, fieldControlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { DEMO_USER } from "@/lib/constants";

const schema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const { login, loginDemo } = useAuth();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = (values: Values) => {
    const result = login(values.email, values.password);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success("Welcome back.");
    router.push("/portal");
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-lg sm:p-8">
      <LogoWatermark opacity={0.05} blend="normal" />
      <div className="relative">
        <BrandLogo />
        <h1 className="mt-6 text-2xl font-bold text-charcoal">Log in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Access your projects, proposals, and documents.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 grid gap-4">
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              className={fieldControlClass}
              autoComplete="email"
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
          <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
            Log in
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => {
              loginDemo();
              toast.success("Signed in as demo client.");
              router.push("/portal");
            }}
          >
            Continue as demo client
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Demo login: {DEMO_USER.email} / {DEMO_USER.password}
        </p>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <Link className="text-electric hover:underline" href="/forgot-password">
            Forgot password?
          </Link>
          <p>
            Need an account?{" "}
            <Link className="font-medium text-electric hover:underline" href="/create-account">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
