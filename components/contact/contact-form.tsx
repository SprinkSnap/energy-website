"use client";

import { useActionState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { submitContact, type SubmitContactState } from "@/app/actions/contact";
import { contactFormSchema, type ContactFormInput } from "@/lib/contact/schema";
import { trackEvent } from "@/lib/analytics";
import { Field, fieldControlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT } from "@/lib/constants";
import { Mail, Phone, Clock } from "lucide-react";

const initialState: SubmitContactState | null = null;

export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(submitContact, initialState);
  const {
    register,
    reset,
    formState: { errors },
  } = useForm<ContactFormInput>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { website: "" },
  });

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      trackEvent("contact_submitted");
      reset({ name: "", email: "", company: "", phone: "", message: "", website: "" });
      formRef.current?.reset();
      toast.success("Message sent. We typically reply within one business day.");
      return;
    }
    trackEvent("contact_submission_failed");
    toast.error(state.error);
  }, [state, reset]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
        {...register("website")}
      />
      <Field label="Name" htmlFor="name" error={errors.name?.message ?? fieldErrors?.name?.[0]}>
        <Input
          id="name"
          name="name"
          className={fieldControlClass}
          autoComplete="name"
          required
          disabled={isPending}
        />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message ?? fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          className={fieldControlClass}
          autoComplete="email"
          required
          disabled={isPending}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" htmlFor="company">
          <Input
            id="company"
            name="company"
            className={fieldControlClass}
            autoComplete="organization"
            disabled={isPending}
          />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            type="tel"
            className={fieldControlClass}
            autoComplete="tel"
            disabled={isPending}
          />
        </Field>
      </div>
      <Field
        label="How can we help?"
        htmlFor="message"
        error={errors.message?.message ?? fieldErrors?.message?.[0]}
      >
        <Textarea
          id="message"
          name="message"
          rows={6}
          className="min-h-32"
          required
          disabled={isPending}
        />
      </Field>
      <Button type="submit" variant="brand" size="lg" disabled={isPending} className="min-h-11">
        {isPending ? "Sending…" : "Send message"}
      </Button>
      {state?.ok ? (
        <p className="text-sm text-brand-green-dark" role="status" aria-live="polite">
          Thank you. Your message was delivered successfully.
        </p>
      ) : state && !state.ok ? (
        <div role="alert" aria-live="assertive">
          <p className="text-sm text-destructive">{state.error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            You can also email{" "}
            <a href={`mailto:${CONTACT.email}`} className="text-electric hover:underline">
              {CONTACT.email}
            </a>{" "}
            directly.
          </p>
        </div>
      ) : null}
    </form>
  );
}

export function ContactDetails() {
  return (
    <aside className="rounded-3xl border border-border/80 bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.04),0_12px_32px_rgba(11,18,32,0.05)]">
      <h2 className="text-lg font-semibold text-charcoal">Direct contact</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Contact details below are configured in <code>lib/constants.ts</code>. Verify before
        production launch.
      </p>
      <ul className="mt-4 grid gap-4 text-sm">
        <li className="flex gap-3">
          <Mail className="size-5 shrink-0 text-electric" aria-hidden />
          <a className="hover:underline" href={`mailto:${CONTACT.email}`}>
            {CONTACT.email}
          </a>
        </li>
        <li className="flex gap-3">
          <Phone className="size-5 shrink-0 text-electric" aria-hidden />
          <a className="hover:underline" href={CONTACT.phoneHref}>
            {CONTACT.phoneDisplay}
          </a>
        </li>
        <li className="flex gap-3">
          <Clock className="size-5 shrink-0 text-electric" aria-hidden />
          <span>{CONTACT.hours}</span>
        </li>
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">{CONTACT.region}</p>
    </aside>
  );
}
