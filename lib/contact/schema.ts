import { z } from "zod";

export const contactFormSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name."),
  email: z.string().trim().email("Enter a valid email."),
  company: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  message: z.string().trim().min(10, "Tell us a little about the project."),
  /** Honeypot — must remain empty */
  website: z.string().max(0).optional(),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;

export type ContactPayload = Omit<ContactFormInput, "website"> & {
  type: "contact";
  submittedAt: string;
  source: "contact_page";
};
