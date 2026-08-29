import type { Project } from "@/lib/types";

/** Clients may delete a project until the first 50% deposit is paid. */
export function canDeleteProject(project: Project): boolean {
  return project.payment !== "deposit-paid" && project.payment !== "paid-in-full";
}
