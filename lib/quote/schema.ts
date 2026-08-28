import { z } from "zod";

export const quoteServiceValues = [
  "sb12",
  "hot2000",
  "eeds",
  "high-wwr",
  "unsure",
] as const;

export const quoteDrawingsValues = ["ready", "in-progress", "not-yet"] as const;

export const quoteProjectTypes = [
  "single-detached",
  "semi-detached",
  "townhouse",
  "other",
  "unsure",
] as const;

export const quoteFormSchema = z.object({
  service: z.enum(quoteServiceValues, { message: "Select a service." }),
  drawingsStatus: z.enum(quoteDrawingsValues, {
    message: "Select your drawing status.",
  }),
  city: z.string().trim().min(2, "Enter the project city or municipality."),
  projectType: z.enum(quoteProjectTypes).optional(),
  timeline: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  name: z.string().trim().min(2, "Please enter your name."),
  email: z.string().trim().email("Enter a valid email."),
  company: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  website: z.string().max(0).optional(),
  sourcePage: z.string().optional(),
  ctaLocation: z.string().optional(),
});

export type QuoteFormInput = z.infer<typeof quoteFormSchema>;

export type QuotePayload = Omit<QuoteFormInput, "website"> & {
  type: "quote";
  submittedAt: string;
};

export const QUOTE_SERVICE_LABELS: Record<(typeof quoteServiceValues)[number], string> = {
  sb12: "SB-12 compliance package",
  hot2000: "HOT2000 energy modelling",
  eeds: "EEDS / permit documentation",
  "high-wwr": "High window-to-wall ratio / custom project",
  unsure: "I'm not sure",
};

export const QUOTE_DRAWINGS_LABELS: Record<(typeof quoteDrawingsValues)[number], string> = {
  ready: "Yes, drawings are ready",
  "in-progress": "Drawings are in progress",
  "not-yet": "Not yet",
};
