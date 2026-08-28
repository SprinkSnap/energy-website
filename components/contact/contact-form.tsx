"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Field, fieldControlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT } from "@/lib/constants";
import { Mail, Phone, Clock } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Please enter your name."),
  email: z.string().email("Enter a valid email."),
  company: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().min(10, "Tell us a little about the project."),
});

type FormValues = z.infer<typeof schema>;

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    // Replace with a server action or CRM webhook.
    await new Promise((r) => setTimeout(r, 500));
    console.info("Contact submission (placeholder)", values);
    setSubmitted(true);
    reset();
    toast.success("Message sent. We typically reply within one business day.");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <Field label="Name" htmlFor="name" error={errors.name?.message}>
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
      <Field label="How can we help?" htmlFor="message" error={errors.message?.message}>
        <Textarea id="message" rows={6} className="min-h-32" {...register("message")} />
      </Field>
      <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send message"}
      </Button>
      {submitted ? (
        <p className="text-sm text-brand-green-dark" role="status">
          Thank you. Your message has been recorded.
        </p>
      ) : null}
    </form>
  );
}

export function ContactDetails() {
  return (
    <aside className="rounded-3xl border border-border/80 bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.04),0_12px_32px_rgba(11,18,32,0.05)]">
      <h2 className="text-lg font-semibold text-charcoal">Direct contact</h2>
      <ul className="mt-4 grid gap-4 text-sm">
        <li className="flex gap-3">
          <Mail className="size-5 text-electric" aria-hidden />
          <a className="hover:underline" href={`mailto:${CONTACT.email}`}>
            {CONTACT.email}
          </a>
        </li>
        <li className="flex gap-3">
          <Phone className="size-5 text-electric" aria-hidden />
          <a className="hover:underline" href={CONTACT.phoneHref}>
            {CONTACT.phoneDisplay}
          </a>
        </li>
        <li className="flex gap-3">
          <Clock className="size-5 text-electric" aria-hidden />
          <span>{CONTACT.hours}</span>
        </li>
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">{CONTACT.region}</p>
    </aside>
  );
}
