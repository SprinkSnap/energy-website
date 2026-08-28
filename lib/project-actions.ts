import type { Project } from "@/lib/types";

export function projectNextAction(project: Project): {
  href: string;
  label: string;
  help: string;
} {
  const base = `/portal/projects/${project.id}`;

  switch (project.status) {
    case "draft":
      return {
        href: `${base}/wizard`,
        label: "Continue setup",
        help: "Answer a few questions and upload drawings. You can save and come back anytime.",
      };
    case "submitted":
    case "proposal":
      return {
        href: `${base}/proposal`,
        label: "Review proposal",
        help: "Check the fee and what is included, then accept to continue.",
      };
    case "kickoff-call":
    case "optimization":
    case "options-review":
    case "client-selection":
      return {
        href: `${base}/optimization`,
        label: "See optimization steps",
        help: "We schedule calls and send options. Nothing is due until you pick a path.",
      };
    case "project-review":
      return {
        href: `${base}/wwr`,
        label: "See window-to-wall review",
        help: "We are confirming window-to-wall ratio and the right compliance path.",
      };
    case "awaiting-deposit":
      return {
        href: `${base}/deposit`,
        label: "Pay 50% deposit",
        help: "The deposit starts modelling. The remaining 50% is due when documents are ready.",
      };
    case "in-progress":
      return {
        href: `${base}/progress`,
        label: "View progress",
        help: "We are preparing the HOT2000 models and EEDS. You will be notified when they are ready.",
      };
    case "final-payment-required":
      return {
        href: `${base}/final-payment`,
        label: "Pay remaining balance",
        help: "Pay the remaining 50% to unlock your EEDS and HOT2000 reports.",
      };
    case "complete":
      return {
        href: `${base}/documents`,
        label: "Download documents",
        help: "Your permit package is unlocked. Download the EEDS and HOT2000 reports.",
      };
    default:
      return {
        href: base,
        label: "Open project",
        help: "View this project’s status and documents.",
      };
  }
}
