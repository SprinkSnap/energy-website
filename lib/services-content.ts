import type { LucideIcon } from "lucide-react";
import {
  Calculator,
  FileCheck2,
  FileSpreadsheet,
  Layers3,
  ShieldCheck,
  Wind,
} from "lucide-react";

export type ServiceLanding = {
  slug: string;
  path: string;
  icon: LucideIcon;
  title: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  intro: string;
  whoFor: string[];
  inputs: string[];
  outputs: string[];
  process: { title: string; body: string }[];
  faq: { question: string; answer: string }[];
  relatedLinks: { href: string; label: string }[];
};

export const SERVICE_LANDINGS: ServiceLanding[] = [
  {
    slug: "sb-12-compliance",
    path: "/services/sb-12-compliance",
    icon: ShieldCheck,
    title: "SB-12 Compliance",
    metaTitle: "SB-12 Compliance Packages for Ontario Residential Projects",
    metaDescription:
      "Performance-path SB-12 compliance analysis for Ontario residential building permits. Building takeoff, HOT2000 modelling, and permit-ready documentation.",
    eyebrow: "SB-12 compliance",
    h1: "SB-12 compliance for Ontario residential permits",
    intro:
      "Supplementary Standard SB-12 sets the energy requirements for Part 9 residential buildings in Ontario. We prepare a performance-path compliance package so your project can move through municipal review with a defensible model and documentation set.",
    whoFor: [
      "Production builders submitting repeat Part 9 models",
      "Custom home designers with defined envelope assemblies",
      "Architectural technologists coordinating permit sets",
      "Builders who need SB-12 handled without running HOT2000 in-house",
    ],
    inputs: [
      "Architectural drawings (PDF or common CAD exports)",
      "Confirmed envelope assemblies where Route 1 applies",
      "Mechanical system selections or placeholders for review",
      "Project address, builder, and model name",
    ],
    outputs: [
      "SB-12 compliance analysis against the applicable package",
      "Supporting HOT2000 proposed and reference models",
      "EEDS aligned to the modelled path",
      "Permit-ready documentation for municipal submission",
    ],
    process: [
      {
        title: "Upload drawings",
        body: "Create a client account and upload your architectural set. We complete the building takeoff and geometry.",
      },
      {
        title: "Confirm specifications",
        body: "Confirm assemblies, glazing, and mechanical selections in the project wizard or through Route 2 review.",
      },
      {
        title: "Accept proposal & deposit",
        body: "Review a fixed quote before deposit. A 50% deposit starts the modelling work.",
      },
      {
        title: "Receive the package",
        body: "Download HOT2000 reports, SB-12 analysis, EEDS, and supporting documents after final payment.",
      },
    ],
    faq: [
      {
        question: "What SB-12 path do you use?",
        answer:
          "Most complete Route 1 projects use a performance path with modelled assemblies. Over-22% window-to-wall ratio and optimization routes are handled with a structured review before modelling begins.",
      },
      {
        question: "Do I need to pick the SB-12 package myself?",
        answer:
          "We identify the applicable package based on your project inputs and modelled assemblies. You confirm specifications; we handle the compliance analysis.",
      },
    ],
    relatedLinks: [
      { href: "/services/hot2000-energy-modeling", label: "HOT2000 energy modeling" },
      { href: "/services/eeds", label: "EEDS preparation" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    slug: "hot2000-energy-modeling",
    path: "/services/hot2000-energy-modeling",
    icon: Calculator,
    title: "HOT2000 Energy Modeling",
    metaTitle: "HOT2000 Energy Modelling for Ontario Residential Projects",
    metaDescription:
      "Proposed and code/reference HOT2000 models prepared from architectural drawings for Ontario residential SB-12 and permit submissions.",
    eyebrow: "HOT2000 modelling",
    h1: "HOT2000 energy modeling from your drawings",
    intro:
      "EnerGuide HOT2000 is the simulation engine behind Ontario residential energy compliance. We build proposed and reference models from your drawings so you do not need to maintain in-house modelling capacity for every permit.",
    whoFor: [
      "Builders who submit multiple Part 9 homes per year",
      "Designers coordinating energy compliance with architectural drawings",
      "Teams that want geometry and window-to-wall ratio calculated externally",
      "Projects already on a performance path for SB-12",
    ],
    inputs: [
      "Architectural floor plans and elevations",
      "Foundation, wall, ceiling, and window specifications",
      "Heating, ventilation, and domestic hot water selections",
      "Any existing energy notes or prior model files",
    ],
    outputs: [
      "HOT2000 proposed (as-designed) model and report",
      "HOT2000 reference/code model where required",
      "Geometry and takeoff documentation used in the model",
      "Files packaged with SB-12 analysis and EEDS for permit",
    ],
    process: [
      {
        title: "Drawing intake",
        body: "Upload PDFs through the client portal. We extract areas, volumes, glazing, and window-to-wall ratio.",
      },
      {
        title: "Specification review",
        body: "Confirm insulation levels, window performance, and mechanical systems before the model is finalized.",
      },
      {
        title: "Modelling & QA",
        body: "Each model is prepared and reviewed by Energy Compliant Design — not auto-generated and left unchecked.",
      },
      {
        title: "Report delivery",
        body: "Receive HOT2000 outputs with the broader permit package after proposal acceptance and payment milestones.",
      },
    ],
    faq: [
      {
        question: "Do I need to provide HOT2000 files?",
        answer:
          "No. Upload architectural drawings and confirm specifications. We prepare the HOT2000 model and reports as part of the service.",
      },
      {
        question: "How fast can modelling be completed?",
        answer:
          "Complete Route 1 projects with clear specifications are typically modelled within 48 business hours after drawings and a paid deposit are received.",
      },
    ],
    relatedLinks: [
      { href: "/services/sb-12-compliance", label: "SB-12 compliance" },
      { href: "/services/eeds", label: "EEDS preparation" },
      { href: "/contact", label: "Contact support" },
    ],
  },
  {
    slug: "eeds",
    path: "/services/eeds",
    icon: FileSpreadsheet,
    title: "EEDS Preparation",
    metaTitle: "EEDS — Energy Efficiency Design Summary for Ontario Permits",
    metaDescription:
      "Energy Efficiency Design Summary (EEDS) forms prepared to match your HOT2000 model and SB-12 compliance path for Ontario residential building permits.",
    eyebrow: "EEDS preparation",
    h1: "Energy Efficiency Design Summary (EEDS) for permit review",
    intro:
      "The Energy Efficiency Design Summary is the municipal-facing form that ties your modelled assemblies and compliance path to the building permit application. We complete the EEDS to match the HOT2000 model and SB-12 analysis — not as a disconnected checklist.",
    whoFor: [
      "Builders submitting Part 9 permits in Ontario municipalities",
      "Designers who need EEDS aligned to a performance-path model",
      "Teams receiving HOT2000 and SB-12 work from Energy Compliant Design",
      "Projects where the city expects EEDS with the energy package",
    ],
    inputs: [
      "Architectural drawings and confirmed specifications",
      "Compliance route (Route 1, 2, or 3 as applicable)",
      "Project and builder details for the permit set",
      "Mechanical and envelope selections reflected in the model",
    ],
    outputs: [
      "Completed Energy Efficiency Design Summary",
      "Consistency with HOT2000 proposed/reference reports",
      "Alignment to the SB-12 compliance analysis",
      "Inclusion in the downloadable permit package",
    ],
    process: [
      {
        title: "Model alignment",
        body: "EEDS fields are populated from the same assemblies and mechanicals used in the HOT2000 proposed model.",
      },
      {
        title: "Compliance cross-check",
        body: "The summary reflects the SB-12 path and package selected for the project.",
      },
      {
        title: "Portal delivery",
        body: "EEDS is available with other permit documents in the client portal after final payment.",
      },
      {
        title: "Municipal submission",
        body: "Include the EEDS with your building permit application alongside architectural drawings.",
      },
    ],
    faq: [
      {
        question: "Can I order EEDS without HOT2000 modelling?",
        answer:
          "EEDS is prepared as part of a complete energy compliance package that includes HOT2000 modelling and SB-12 analysis so the form matches the model.",
      },
      {
        question: "Which municipalities accept your EEDS?",
        answer:
          "The form follows Ontario SB-12 requirements for Part 9 residential projects. Confirm any local submission preferences with your building department.",
      },
    ],
    relatedLinks: [
      { href: "/services/sb-12-compliance", label: "SB-12 compliance" },
      { href: "/services/hot2000-energy-modeling", label: "HOT2000 energy modeling" },
      { href: "/how-it-works", label: "Project routes" },
    ],
  },
  {
    slug: "high-window-to-wall-ratio",
    path: "/services/high-window-to-wall-ratio",
    icon: Wind,
    title: "Over 22% Window-to-Wall Ratio",
    metaTitle: "Over 22% Window-to-Wall Ratio SB-12 Compliance Ontario",
    metaDescription:
      "Performance-path HOT2000 and SB-12 modelling for Ontario homes above 22% window-to-wall ratio. Structured review for high-glazing residential projects.",
    eyebrow: "High glazing / WWR",
    h1: "SB-12 compliance when glazing exceeds 22% WWR",
    intro:
      "Prescriptive SB-12 packages generally do not apply above 22% window-to-wall ratio. High-glazing elevations need a performance path, careful takeoff, and a model that still closes at permit review.",
    whoFor: [
      "Custom homes with large south or rear glazing walls",
      "Architect-led projects with curtain-wall or tall window assemblies",
      "Builders told prescriptive SB-12 will not work for their elevations",
      "Route 3 projects in the Energy Compliant Design portal",
    ],
    inputs: [
      "Architectural drawings showing glazing layout",
      "Path 1 (known specs) or Path 2 (optimization) selection",
      "Target assemblies or openness to options review",
      "Mechanical and ventilation selections for modelling",
    ],
    outputs: [
      "Window-to-wall ratio calculation from your drawings",
      "Performance-path HOT2000 proposed and reference models",
      "SB-12 analysis for the high-WWR compliance path",
      "EEDS and permit documentation coordinated with the model",
    ],
    process: [
      {
        title: "Project review",
        body: "We confirm glazing areas, shading, and whether Path 1 or Path 2 fits the project stage.",
      },
      {
        title: "Performance modelling",
        body: "HOT2000 models test assemblies and mechanicals that can support the elevated glazing ratio.",
      },
      {
        title: "Options review (Route 2 / Path 2)",
        body: "When specifications are not final, we walk through practical trade-offs before the proposal is issued.",
      },
      {
        title: "Permit package",
        body: "Receive defensible reports and forms for municipal submission after deposit and final payment milestones.",
      },
    ],
    faq: [
      {
        question: "How is window-to-wall ratio calculated?",
        answer:
          "We measure glazing and opaque wall areas from your architectural drawings as part of the building takeoff — you do not need to calculate WWR manually.",
      },
      {
        question: "Is Route 3 slower than Route 1?",
        answer:
          "Yes. High-WWR and optimization projects follow a structured review and modelling path rather than the 48-hour Route 1 turnaround for complete, known-specification files.",
      },
    ],
    relatedLinks: [
      { href: "/services/sb-12-compliance", label: "SB-12 compliance" },
      { href: "/how-it-works", label: "Route 3 overview" },
      { href: "/contact", label: "Discuss your elevations" },
    ],
  },
];

export const HOME_SERVICE_CARDS = [
  {
    title: "HOT2000 Energy Modeling",
    description:
      "Proposed and code/reference models prepared from your drawings and specifications.",
    icon: Layers3,
    href: "/services/hot2000-energy-modeling",
  },
  {
    title: "SB-12 Compliance",
    description:
      "Performance-path analysis for Ontario Supplementary Standard SB-12 residential projects.",
    icon: ShieldCheck,
    href: "/services/sb-12-compliance",
  },
  {
    title: "EEDS Preparation",
    description:
      "Energy Efficiency Design Summary forms completed for municipal permit review.",
    icon: FileCheck2,
    href: "/services/eeds",
  },
  {
    title: "Building Takeoff",
    description:
      "We extract geometry, areas, and window-to-wall ratio so you do not have to.",
    icon: Calculator,
    href: "/services/hot2000-energy-modeling",
  },
] as const;
