export const SITE_NAME = "Energy Compliant Design";
export const SITE_TAGLINE = "Energy Modeling. Code Compliance. Peace of Mind.";
export const SITE_SUPPORT_LINE = "HOT2000 | SB-12 | EEDS | 48-HOUR DELIVERY";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.energycompliantdesign.ca";

export const CONTACT = {
  email: "hello@energycompliantdesign.ca",
  phoneDisplay: "(437) 555-2012",
  phoneHref: "tel:+14375552012",
  hours: "Monday–Friday, 8:00 a.m. – 5:00 p.m. ET",
  region: "Serving builders and designers across Ontario",
  address: "Ontario, Canada",
};

export const NAV_LINKS = [
  { href: "/services", label: "Services" },
  { href: "/resources", label: "Resources" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export const DEMO_USER = {
  id: "user-demo",
  name: "Jordan Patel",
  email: "demo@energycompliantdesign.ca",
  password: "Demo1234!",
  company: "Wellington Homes",
  phone: "(416) 555-0148",
};

export const PRICING_DEFAULT = {
  professionalFee: 1480,
  hstRate: 0.13,
};

export const WIZARD_STEPS = [
  { id: "account", label: "Account" },
  { id: "service", label: "Service" },
  { id: "project", label: "Project" },
  { id: "foundation", label: "Foundation" },
  { id: "insulation", label: "Insulation" },
  { id: "windows", label: "Windows" },
  { id: "mechanical", label: "Mechanical" },
  { id: "drawings", label: "Drawings" },
  { id: "review", label: "Review" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export const WIZARD_FLOW_STEPS = WIZARD_STEPS.filter(
  (step): step is Exclude<(typeof WIZARD_STEPS)[number], { id: "account" }> =>
    step.id !== "account",
);

export const DELIVERABLES = [
  "HOT2000 proposed model",
  "HOT2000 reference/code model",
  "SB-12 compliance analysis",
  "EEDS — Energy Efficiency Design Summary",
  "Permit-ready documentation",
] as const;

export const FAQ_ITEMS = [
  {
    question: "What is included in an SB-12 energy compliance package?",
    answer:
      "A typical package includes building takeoff, HOT2000 energy modelling, SB-12 compliance analysis, EEDS preparation, proposed and code/reference HOT2000 reports, and a permit-ready document set.",
  },
  {
    question: "How fast is 48-hour delivery?",
    answer:
      "Complete, well-specified Route 1 projects are typically modelled and packaged within 48 business hours after drawings and a paid deposit are received. Custom optimization and over-22% WWR projects follow a longer, structured review path.",
  },
  {
    question: "Do I need to calculate window-to-wall ratio or HOT2000 geometry?",
    answer:
      "No. Upload architectural drawings and Energy Compliant Design completes the building takeoff, geometry, and window-to-wall ratio as part of the service.",
  },
  {
    question: "When do I pay?",
    answer:
      "After you accept the proposal, a 50% deposit starts the modelling work. Final documents remain locked until the remaining 50% is paid.",
  },
  {
    question: "What if my project is over 22% window-to-wall ratio?",
    answer:
      "Prescriptive SB-12 packages generally cannot be used above 22% WWR. Choose Route 3 and we will review the project, identify a compliant performance path, and prepare the required modelling package.",
  },
  {
    question: "Can you help if I do not know the specifications yet?",
    answer:
      "Yes. Route 2 includes a kickoff call, Energy Compliant Design review, optimization, an options review call, and your selection of the preferred solution before the proposal is issued.",
  },
] as const;
