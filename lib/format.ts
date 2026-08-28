import type {
  FoundationType,
  PaymentStatus,
  Project,
  ProjectStatus,
  ServiceRoute,
} from "@/lib/types";

export const SERVICE_ROUTE_LABEL: Record<ServiceRoute, string> = {
  "known-specs": "Known Specifications",
  "custom-optimization": "Custom (Optimization)",
  "over-22-wwr": "Over 22% WWR",
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  "kickoff-call": "Kickoff Call",
  optimization: "Optimization",
  "options-review": "Options Review",
  "client-selection": "Client Selection",
  "project-review": "Project Review / Optimization",
  proposal: "Proposal",
  "awaiting-deposit": "Awaiting Deposit",
  "in-progress": "In Progress",
  "final-payment-required": "Final Payment Required",
  complete: "Complete",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  none: "—",
  unpaid: "Unpaid",
  "deposit-paid": "Deposit Paid",
  "paid-in-full": "Paid in Full",
};

export const FOUNDATION_LABEL: Record<FoundationType, string> = {
  basement: "Basement",
  crawlspace: "Crawlspace",
  "walkout-basement": "Walkout Basement",
  "walkout-deck": "Walkout Deck (Lookout)",
  "slab-on-grade": "Slab-on-Grade",
};

export const WINDOW_LABEL: Record<string, string> = {
  "u12-er34": "U-Value 1.2 / ER 34",
  "u14-er29": "U-Value 1.4 / ER 29",
  "u16-er25": "U-Value 1.6 / ER 25",
};

export const HEATING_EQUIPMENT = [
  "Min. 96% AFUE Furnace with ECM Motor (or ESNH Certified)",
  "Electric Furnace",
  "Air Source Heat Pump",
  "Ground Source Heat Pump",
  "Boiler — Min. 96% AFUE",
  "N/A",
] as const;

export const COOLING_EQUIPMENT = [
  "Air Source Heat Pump",
  "Ground Source Heat Pump",
  "Air Conditioning",
  "N/A",
] as const;

export function serviceLabel(project: Project): string {
  if (!project.route) return "—";
  if (project.route === "over-22-wwr" && project.over22Path === "path-2-help") {
    return "Over 22% WWR — Path 2";
  }
  if (project.route === "over-22-wwr" && project.over22Path === "path-1-known") {
    return "Over 22% WWR — Path 1";
  }
  return SERVICE_ROUTE_LABEL[project.route];
}

export function cad(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function statusTone(
  status: ProjectStatus,
): "default" | "secondary" | "outline" | "success" | "warning" {
  if (status === "complete") return "success";
  if (status === "in-progress") return "default";
  if (status === "draft") return "outline";
  if (status === "final-payment-required" || status === "awaiting-deposit") {
    return "warning";
  }
  return "secondary";
}

export function routeTimeline(route: ServiceRoute | null): ProjectStatus[] {
  if (route === "custom-optimization") {
    return [
      "draft",
      "submitted",
      "kickoff-call",
      "optimization",
      "options-review",
      "client-selection",
      "proposal",
      "awaiting-deposit",
      "in-progress",
      "final-payment-required",
      "complete",
    ];
  }
  if (route === "over-22-wwr") {
    return [
      "draft",
      "submitted",
      "project-review",
      "proposal",
      "awaiting-deposit",
      "in-progress",
      "final-payment-required",
      "complete",
    ];
  }
  return [
    "draft",
    "submitted",
    "proposal",
    "awaiting-deposit",
    "in-progress",
    "final-payment-required",
    "complete",
  ];
}

export function nextStatusAfterSubmit(route: ServiceRoute | null): ProjectStatus {
  if (route === "custom-optimization") return "kickoff-call";
  if (route === "over-22-wwr") return "project-review";
  return "proposal";
}

export function wallsSummary(project: Project): string {
  const { cavity, cavityOther, continuous, continuousOther } =
    project.insulation.wallsAboveGrade;
  const cav = cavity === "Other" ? cavityOther || "Other" : cavity || "—";
  const ci =
    continuous === "Other" ? continuousOther || "Other" : continuous || "—";
  return `${cav} cavity + ${ci} continuous`;
}
