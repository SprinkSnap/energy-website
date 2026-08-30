"use client";

import { createContext, useContext, type ReactNode } from "react";

const ProjectScopeContext = createContext<string | null>(null);

/** When set, project reads/writes target this client user id (staff admin mode). */
export function ProjectScopeProvider({
  clientUserId,
  children,
}: {
  clientUserId: string;
  children: ReactNode;
}) {
  return (
    <ProjectScopeContext.Provider value={clientUserId}>
      {children}
    </ProjectScopeContext.Provider>
  );
}

export function useProjectScopeUserId(): string | null {
  return useContext(ProjectScopeContext);
}
