"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { submitQuote, type SubmitQuoteState } from "@/app/actions/quote";
import {
  QUOTE_DRAWINGS_LABELS,
  QUOTE_SERVICE_LABELS,
  quoteDrawingsValues,
  quoteProjectTypes,
  quoteServiceValues,
  type QuoteFormInput,
} from "@/lib/quote/schema";
import { saveQuotePrefill } from "@/lib/quote/prefill";
import { trackEvent } from "@/lib/analytics";
import { Field, fieldControlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/lib/utils";

const STEPS = ["service", "drawings", "details", "contact", "done"] as const;
type Step = (typeof STEPS)[number];

const initialSubmitState: SubmitQuoteState | null = null;

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric",
        selected
          ? "border-electric bg-electric-soft text-charcoal"
          : "border-border bg-white text-charcoal hover:border-electric/40",
      )}
    >
      {children}
    </button>
  );
}

export function QuoteFunnel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourcePage = searchParams.get("from") ?? "/";
  const ctaLocation = searchParams.get("cta") ?? undefined;

  const [step, setStep] = useState<Step>("service");
  const [data, setData] = useState<Partial<QuoteFormInput>>({});
  const [fieldError, setFieldError] = useState<string>();
  const [submitState, submitAction, isSubmitting] = useActionState(
    submitQuote,
    initialSubmitState,
  );

  useEffect(() => {
    trackEvent("quote_started", { source_page: sourcePage, cta_location: ctaLocation });
  }, [sourcePage, ctaLocation]);

  useEffect(() => {
    if (!submitState) return;
    if (submitState.ok) {
      trackEvent("quote_submitted", { service: data.service, cta_location: ctaLocation });
      saveQuotePrefill({
        name: data.name ?? "",
        email: data.email ?? "",
        company: data.company,
        phone: data.phone,
        service: data.service!,
        city: data.city ?? "",
        drawingsStatus: data.drawingsStatus!,
        projectType: data.projectType,
      });
      setStep("done");
      return;
    }
    trackEvent("quote_submission_failed");
    setFieldError(submitState.error);
  }, [submitState, data, ctaLocation]);

  const stepIndex = STEPS.indexOf(step);
  const progress = step === "done" ? 100 : ((stepIndex + 1) / (STEPS.length - 1)) * 100;

  const patch = (next: Partial<QuoteFormInput>) => setData((prev) => ({ ...prev, ...next }));

  const goNext = () => {
    setFieldError(undefined);
    if (step === "service") {
      if (!data.service) {
        setFieldError("Select what you need help with.");
        return;
      }
      trackEvent("quote_service_selected", { service: data.service });
      setStep("drawings");
      return;
    }
    if (step === "drawings") {
      if (!data.drawingsStatus) {
        setFieldError("Select your drawing status.");
        return;
      }
      trackEvent("quote_drawings_status_selected", { drawings_status: data.drawingsStatus });
      setStep("details");
      return;
    }
    if (step === "details") {
      if (!data.city?.trim()) {
        setFieldError("Enter the project city or municipality.");
        return;
      }
      trackEvent("quote_project_details_completed");
      setStep("contact");
      return;
    }
  };

  const goBack = () => {
    setFieldError(undefined);
    if (step === "drawings") setStep("service");
    else if (step === "details") setStep("drawings");
    else if (step === "contact") setStep("details");
    else router.back();
  };

  if (step === "done") {
    return (
      <div className="surface-card mx-auto max-w-lg p-6 sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-full bg-brand-green-soft">
          <CheckCircle2 className="size-6 text-brand-green-dark" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-charcoal">Request received</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Thank you. We will review your project details and follow up with next steps for a fixed
          quote. Complete Route 1 projects with ready drawings are typically reviewed within one
          business day.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Drawing upload happens in the client portal after your request is accepted — you do not
          need to re-enter your contact details.
        </p>
        <div className="mt-6 grid gap-3">
          <LinkButton href="/create-account" variant="brand" className="min-h-11 w-full justify-center">
            Create portal access
          </LinkButton>
          <LinkButton href="/how-it-works" variant="outline" className="min-h-11 w-full justify-center">
            See how it works
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>
            Step {stepIndex + 1} of {STEPS.length - 1}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-electric transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="surface-card p-6 sm:p-8">
        {step === "service" ? (
          <fieldset>
            <legend className="text-xl font-bold text-charcoal">What do you need help with?</legend>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the service that best matches your project.
            </p>
            <div className="mt-5 grid gap-2">
              {quoteServiceValues.map((value) => (
                <ChoiceButton
                  key={value}
                  selected={data.service === value}
                  onClick={() => {
                    patch({ service: value });
                    trackEvent("quote_service_selected", { service: value });
                  }}
                >
                  {QUOTE_SERVICE_LABELS[value]}
                </ChoiceButton>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === "drawings" ? (
          <fieldset>
            <legend className="text-xl font-bold text-charcoal">
              Do you have architectural drawings?
            </legend>
            <p className="mt-1 text-sm text-muted-foreground">
              This helps us qualify your project. Secure upload happens in the portal after intake.
            </p>
            <div className="mt-5 grid gap-2">
              {quoteDrawingsValues.map((value) => (
                <ChoiceButton
                  key={value}
                  selected={data.drawingsStatus === value}
                  onClick={() => patch({ drawingsStatus: value })}
                >
                  {QUOTE_DRAWINGS_LABELS[value]}
                </ChoiceButton>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === "details" ? (
          <div className="grid gap-4">
            <div>
              <h2 className="text-xl font-bold text-charcoal">Project details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A few details so we can scope your request.
              </p>
            </div>
            <Field label="City / municipality *" htmlFor="city">
              <Input
                id="city"
                className={fieldControlClass}
                value={data.city ?? ""}
                onChange={(e) => patch({ city: e.target.value })}
                autoComplete="address-level2"
                placeholder="e.g. Toronto, Ottawa, Hamilton"
              />
            </Field>
            <Field label="Project type" htmlFor="projectType" hint="Optional">
              <select
                id="projectType"
                className={cn(fieldControlClass, "w-full")}
                value={data.projectType ?? ""}
                onChange={(e) =>
                  patch({
                    projectType: (e.target.value || undefined) as QuoteFormInput["projectType"],
                  })
                }
              >
                <option value="">Select…</option>
                {quoteProjectTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === "single-detached"
                      ? "Single detached"
                      : type === "semi-detached"
                        ? "Semi-detached"
                        : type === "townhouse"
                          ? "Townhouse"
                          : type === "other"
                            ? "Other"
                            : "Not sure"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target timing" htmlFor="timeline" hint="Optional">
              <Input
                id="timeline"
                className={fieldControlClass}
                value={data.timeline ?? ""}
                onChange={(e) => patch({ timeline: e.target.value })}
                placeholder="e.g. Permit submission in 3 weeks"
              />
            </Field>
            <Field label="Notes" htmlFor="notes" hint="Optional">
              <Textarea
                id="notes"
                rows={4}
                value={data.notes ?? ""}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder="Anything else we should know about the project"
              />
            </Field>
          </div>
        ) : null}

        {step === "contact" ? (
          <form action={submitAction} className="grid gap-4">
            <div>
              <h2 className="text-xl font-bold text-charcoal">Your contact details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We will follow up with next steps for a fixed quote.
              </p>
            </div>
            <input type="hidden" name="service" value={data.service ?? ""} />
            <input type="hidden" name="drawingsStatus" value={data.drawingsStatus ?? ""} />
            <input type="hidden" name="city" value={data.city ?? ""} />
            <input type="hidden" name="projectType" value={data.projectType ?? ""} />
            <input type="hidden" name="timeline" value={data.timeline ?? ""} />
            <input type="hidden" name="notes" value={data.notes ?? ""} />
            <input type="hidden" name="sourcePage" value={sourcePage} />
            <input type="hidden" name="ctaLocation" value={ctaLocation ?? ""} />
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
              defaultValue=""
            />
            <Field label="Full name *" htmlFor="quote-name">
              <Input
                id="quote-name"
                name="name"
                className={fieldControlClass}
                autoComplete="name"
                required
                defaultValue={data.name}
                onBlur={(e) => patch({ name: e.target.value })}
                disabled={isSubmitting}
              />
            </Field>
            <Field label="Email *" htmlFor="quote-email">
              <Input
                id="quote-email"
                name="email"
                type="email"
                className={fieldControlClass}
                autoComplete="email"
                required
                defaultValue={data.email}
                onBlur={(e) => {
                  patch({ email: e.target.value });
                  trackEvent("quote_contact_completed");
                }}
                disabled={isSubmitting}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company" htmlFor="quote-company">
                <Input
                  id="quote-company"
                  name="company"
                  className={fieldControlClass}
                  autoComplete="organization"
                  defaultValue={data.company}
                  onBlur={(e) => patch({ company: e.target.value })}
                  disabled={isSubmitting}
                />
              </Field>
              <Field label="Phone" htmlFor="quote-phone">
                <Input
                  id="quote-phone"
                  name="phone"
                  type="tel"
                  className={fieldControlClass}
                  autoComplete="tel"
                  defaultValue={data.phone}
                  onBlur={(e) => patch({ phone: e.target.value })}
                  disabled={isSubmitting}
                />
              </Field>
            </div>
            {fieldError ? (
              <p className="text-sm text-destructive" role="alert" aria-live="assertive">
                {fieldError}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                className="min-h-11"
                disabled={isSubmitting}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button type="submit" variant="brand" className="min-h-11 flex-1" disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Request my fixed quote"}
              </Button>
            </div>
          </form>
        ) : null}

        {step !== "contact" ? (
          <>
            {fieldError ? (
              <p className="mt-4 text-sm text-destructive" role="alert" aria-live="assertive">
                {fieldError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                className="min-h-11"
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button type="button" variant="brand" onClick={goNext} className="min-h-11 flex-1">
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
