export type UserRole = "client" | "employee" | "owner";

export function isStaffRole(role?: UserRole | null): boolean {
  return role === "owner" || role === "employee";
}

export function isOwnerRole(role?: UserRole | null): boolean {
  return role === "owner";
}

export const ROLE_LABEL: Record<UserRole, string> = {
  client: "Client",
  employee: "Employee",
  owner: "Owner",
};
