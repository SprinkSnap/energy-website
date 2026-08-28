"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { seedDemoProjects } from "@/lib/mock-data";
import { createEmptyProject, type Project } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { DEMO_USER, PRICING_DEFAULT } from "@/lib/constants";

const PROJECTS_KEY = "ecd-projects";
const EMPTY: Project[] = [];
const listeners = new Set<() => void>();
let snapshotCache: { stamp: string; data: Project[] } = { stamp: "", data: EMPTY };

function emit() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function storageKey(userId: string) {
  return `${PROJECTS_KEY}:${userId}`;
}

function ensureDemoProjects(userId: string, email?: string) {
  if (typeof window === "undefined" || email !== DEMO_USER.email) return;
  const key = storageKey(userId);
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, JSON.stringify(seedDemoProjects()));
  }
}

function getProjectsSnapshot(userId: string): Project[] {
  if (typeof window === "undefined" || !userId) return EMPTY;
  const key = storageKey(userId);
  const raw = localStorage.getItem(key) ?? "";
  const stamp = `${key}:${raw}`;
  if (snapshotCache.stamp === stamp) return snapshotCache.data;
  let data: Project[] = EMPTY;
  try {
    data = raw ? (JSON.parse(raw) as Project[]) : EMPTY;
  } catch {
    data = EMPTY;
  }
  snapshotCache = { stamp, data };
  return data;
}

function nextProjectId(existing: Project[]): string {
  const nums = existing
    .map((p) => {
      const match = p.id.match(/(\d+)$/);
      return match ? Number.parseInt(match[1], 10) : Number.NaN;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 120) + 1;
  return `SB12-${String(next).padStart(5, "0")}`;
}

function withUpdatedPricing(project: Project): Project {
  const fee = project.pricing.professionalFee || PRICING_DEFAULT.professionalFee;
  const hst = Math.round(fee * PRICING_DEFAULT.hstRate * 100) / 100;
  const total = Math.round((fee + hst) * 100) / 100;
  const deposit = Math.round((total / 2) * 100) / 100;
  return {
    ...project,
    pricing: {
      professionalFee: fee,
      hst,
      total,
      deposit,
      final: Math.round((total - deposit) * 100) / 100,
    },
  };
}

interface ProjectContextValue {
  projects: Project[];
  ready: boolean;
  getProject: (id: string) => Project | undefined;
  createProject: () => Project;
  saveProject: (project: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => Project | undefined;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  if (user) {
    ensureDemoProjects(user.id, user.email);
  }

  const projects = useSyncExternalStore(
    subscribe,
    () => getProjectsSnapshot(userId),
    () => EMPTY,
  );

  const persist = useCallback(
    (next: Project[]) => {
      if (!userId) return;
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
      emit();
    },
    [userId],
  );

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  );

  const createProject = useCallback(() => {
    const project = withUpdatedPricing(createEmptyProject(nextProjectId(projects)));
    persist([project, ...projects]);
    return project;
  }, [persist, projects]);

  const saveProject = useCallback(
    (project: Project) => {
      const updated = withUpdatedPricing({
        ...project,
        updatedAt: new Date().toISOString(),
      });
      const exists = projects.some((p) => p.id === updated.id);
      persist(exists ? projects.map((p) => (p.id === updated.id ? updated : p)) : [updated, ...projects]);
    },
    [persist, projects],
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<Project>) => {
      const current = projects.find((p) => p.id === id);
      if (!current) return undefined;
      const next = withUpdatedPricing({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      persist(projects.map((p) => (p.id === id ? next : p)));
      return next;
    },
    [persist, projects],
  );

  const value = useMemo(
    () => ({
      projects,
      ready: true,
      getProject,
      createProject,
      saveProject,
      updateProject,
    }),
    [projects, getProject, createProject, saveProject, updateProject],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
}
