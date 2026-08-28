export type ResourceArticle = {
  slug: string;
  path: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  category: string;
  intro: string;
  sections: { heading: string; body: string }[];
  faq?: { question: string; answer: string }[];
  relatedServices: { href: string; label: string }[];
};

export const RESOURCE_ARTICLES: ResourceArticle[] = [
  {
    slug: "what-drawings-are-required-for-hot2000",
    path: "/resources/what-drawings-are-required-for-hot2000",
    title: "What Drawings Are Required for HOT2000 Energy Modelling?",
    metaTitle: "What Drawings Are Required for HOT2000 Energy Modelling?",
    metaDescription:
      "Architectural drawings typically needed for Ontario residential HOT2000 energy modelling and SB-12 compliance packages.",
    category: "HOT2000",
    intro:
      "HOT2000 models are built from your architectural set. Complete, dimensioned drawings reduce back-and-forth and help Route 1 projects move faster.",
    sections: [
      {
        heading: "Floor plans",
        body: "Dimensioned floor plans showing room layouts, exterior wall locations, and stair openings. These define heated floor area and interior volume.",
      },
      {
        heading: "Elevations",
        body: "Front, rear, and side elevations with overall building height, window locations, and door placements. Elevations support glazing area and window-to-wall ratio calculations.",
      },
      {
        heading: "Foundation and sections",
        body: "Foundation plans and building sections help confirm basement height, slab-on-grade areas, and ceiling heights used in the model.",
      },
      {
        heading: "Window and door schedules",
        body: "If available, schedules with sizes and performance values speed up specification. If not yet finalized, Route 2 optimization may be more appropriate.",
      },
      {
        heading: "What you do not need to prepare",
        body: "You do not need to calculate HOT2000 geometry, window-to-wall ratio, or SB-12 package selection before upload. Energy Compliant Design completes the building takeoff from your drawings.",
      },
    ],
    faq: [
      {
        question: "Are PDF drawings acceptable?",
        answer:
          "Yes. PDF architectural sets are the most common intake format through the client portal.",
      },
    ],
    relatedServices: [
      { href: "/services/hot2000-energy-modeling", label: "HOT2000 energy modelling" },
      { href: "/quote", label: "Request a quote" },
    ],
  },
  {
    slug: "what-is-an-eeds",
    path: "/resources/what-is-an-eeds",
    title: "What Is an EEDS for an Ontario Building Permit?",
    metaTitle: "What Is an EEDS for an Ontario Building Permit?",
    metaDescription:
      "Learn what the Energy Efficiency Design Summary (EEDS) is, when Ontario municipalities require it, and how it relates to HOT2000 and SB-12.",
    category: "EEDS",
    intro:
      "The Energy Efficiency Design Summary (EEDS) is a municipal-facing form that connects your modelled energy package to the building permit application for Part 9 residential projects in Ontario.",
    sections: [
      {
        heading: "What the EEDS documents",
        body: "The EEDS summarizes the compliance path, key envelope assemblies, and mechanical selections reflected in the HOT2000 model. It is intended to match the proposed design — not a generic checklist.",
      },
      {
        heading: "How EEDS relates to HOT2000 and SB-12",
        body: "HOT2000 provides the simulation results. SB-12 defines the compliance requirement. The EEDS presents the selected path and assemblies in the format many Ontario building departments expect at permit counter.",
      },
      {
        heading: "Municipal requirements vary",
        body: "Most Ontario municipalities require energy documentation for Part 9 residential permits, but submission preferences can differ. Confirm local requirements with your building department before submission.",
      },
      {
        heading: "When EEDS is prepared",
        body: "EEDS is completed after the HOT2000 proposed model and SB-12 analysis are finalized, so the form aligns with the permit package you download from the client portal.",
      },
    ],
    relatedServices: [
      { href: "/services/eeds", label: "EEDS preparation" },
      { href: "/services/sb-12-compliance", label: "SB-12 compliance" },
    ],
  },
  {
    slug: "sb12-performance-vs-prescriptive",
    path: "/resources/sb12-performance-vs-prescriptive",
    title: "SB-12 Performance Path vs Prescriptive Compliance",
    metaTitle: "SB-12 Performance Path vs Prescriptive Compliance",
    metaDescription:
      "Understand when Ontario SB-12 prescriptive packages apply versus a performance path with HOT2000 modelling for residential projects.",
    category: "SB-12",
    intro:
      "Supplementary Standard SB-12 offers prescriptive packages and performance paths. The right approach depends on your glazing ratio, assembly selections, and how finalized the design is.",
    sections: [
      {
        heading: "Prescriptive packages",
        body: "Prescriptive SB-12 packages define specific assembly requirements. They can be efficient when the design fits a listed package and window-to-wall ratio stays within applicable limits — generally not above 22% WWR for typical prescriptive use.",
      },
      {
        heading: "Performance path",
        body: "A performance path uses HOT2000 modelling to demonstrate compliance with SB-12 energy targets. This is common for custom homes, optimized assemblies, and projects that do not map cleanly to a prescriptive package.",
      },
      {
        heading: "High glazing projects",
        body: "Projects above 22% window-to-wall ratio typically require a performance path and additional review. See our high-WWR service route for structured modelling on elevated glazing elevations.",
      },
      {
        heading: "How Energy Compliant Design helps",
        body: "We identify the applicable path from your drawings and specifications, model the proposed design, and prepare the SB-12 analysis and EEDS as part of a coordinated permit package.",
      },
    ],
    relatedServices: [
      { href: "/services/sb-12-compliance", label: "SB-12 compliance" },
      { href: "/services/high-window-to-wall-ratio", label: "Over 22% WWR projects" },
    ],
  },
  {
    slug: "window-to-wall-ratio-sb12",
    path: "/resources/window-to-wall-ratio-sb12",
    title: "How Window-to-Wall Ratio Affects SB-12 Compliance",
    metaTitle: "How Window-to-Wall Ratio Affects SB-12 Compliance",
    metaDescription:
      "Why window-to-wall ratio matters for Ontario SB-12 residential compliance and when a performance path is required.",
    category: "SB-12",
    intro:
      "Window-to-wall ratio (WWR) compares total glazing area to opaque wall area. It is a common reason prescriptive SB-12 packages cannot be used on high-glazing custom homes.",
    sections: [
      {
        heading: "The 22% threshold",
        body: "Prescriptive SB-12 packages generally do not apply above 22% WWR. Above that threshold, a performance path with HOT2000 modelling is typically required.",
      },
      {
        heading: "How WWR is calculated",
        body: "WWR is calculated from architectural drawings by measuring glazing and opaque wall areas. Energy Compliant Design completes this takeoff — you do not need to calculate it manually.",
      },
      {
        heading: "Design implications",
        body: "Large rear glazing walls, tall window assemblies, and curtain-wall elements often push projects into performance-path territory. Early review can prevent permit delays.",
      },
      {
        heading: "Route 3 in the portal",
        body: "Choose Route 3 (over 22% WWR) in the project wizard when prescriptive packages are unlikely to apply. We review Path 1 or Path 2 options before modelling begins.",
      },
    ],
    relatedServices: [
      { href: "/services/high-window-to-wall-ratio", label: "High WWR compliance" },
      { href: "/quote", label: "Request a quote" },
    ],
  },
  {
    slug: "sb12-permit-package",
    path: "/resources/sb12-permit-package",
    title: "What Is Included in an Ontario SB-12 Permit Package?",
    metaTitle: "What Is Included in an Ontario SB-12 Permit Package?",
    metaDescription:
      "Typical deliverables in an Ontario residential SB-12 energy compliance permit package: HOT2000, SB-12 analysis, EEDS, and supporting documentation.",
    category: "Permit packages",
    intro:
      "A permit-ready SB-12 package coordinates simulation outputs, compliance analysis, and municipal forms so builders can submit with confidence.",
    sections: [
      {
        heading: "HOT2000 proposed model",
        body: "The as-designed EnerGuide HOT2000 model and report reflecting your confirmed envelope assemblies, glazing, and mechanical systems.",
      },
      {
        heading: "HOT2000 reference/code model",
        body: "A reference model where required by the compliance path, supporting SB-12 performance comparisons.",
      },
      {
        heading: "SB-12 compliance analysis",
        body: "Documentation showing how the proposed design meets Ontario Supplementary Standard SB-12 requirements for your project type.",
      },
      {
        heading: "Energy Efficiency Design Summary (EEDS)",
        body: "The municipal-facing summary form aligned to the modelled assemblies and compliance path.",
      },
      {
        heading: "Supporting permit documentation",
        body: "Additional reports and forms coordinated for building permit submission. Municipal checklists can vary — confirm local requirements before filing.",
      },
      {
        heading: "Typical turnaround",
        body: "Complete Route 1 projects with ready drawings and confirmed specifications are typically packaged within 48 business hours after deposit. Optimization and high-WWR projects follow a structured review path.",
      },
    ],
    relatedServices: [
      { href: "/services/sb-12-compliance", label: "SB-12 compliance" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
];
