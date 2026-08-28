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

const schema = z
  .object({
    name: z.string().min(2, "Enter your name."),
    email: z.string().email("Enter a valid email."),
    company: z.string().optional(),
    phone: z.string().optional(),
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string().min(8),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

type Values = z.infer<typeof schema>;

export function CreateAccountForm() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = (values: Values) => {
    const result = registerUser({
      name: values.name,
      email: values.email,
      password: values.password,
      company: values.company,
      phone: values.phone,
    });
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success("Account created.");
    router.push("/portal");
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-lg sm:p-8">
      <LogoWatermark opacity={0.05} blend="normal" />
      <div className="relative">
        <BrandLogo />
        <h1 className="mt-6 text-2xl font-bold text-charcoal">Create Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a client portal to start SB-12 projects and upload drawings.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 grid gap-4">
          <Field label="Full name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" className={fieldControlClass} autoComplete="name" {...register("name")} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" className={fieldControlClass} autoComplete="email" {...register("email")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="company">
              <Input id="company" className={fieldControlClass} autoComplete="organization" {...register("company")} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" className={fieldControlClass} autoComplete="tel" {...register("phone")} />
            </Field>
          </div>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input id="password" type="password" className={fieldControlClass} autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
            <Input id="confirm" type="password" className={fieldControlClass} autoComplete="new-password" {...register("confirm")} />
          </Field>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
            Create Account
          </Button>
        </form>
        <p className="mt-4 text-sm">
          Already registered?{" "}
          <Link className="font-medium text-electric hover:underline" href="/login">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
