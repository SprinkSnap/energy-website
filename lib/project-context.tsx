"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { seedDemoProjects } from "@/lib/mock-data";
import { createEmptyProject, type Project } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useProjectScopeUserId } from "@/lib/project-scope";
import { DEMO_USER } from "@/lib/constants";
import { calculatePricing, professionalFeeForRoute } from "@/lib/pricing";
import { canDeleteProject } from "@/lib/project-rules";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  deleteProjectRow,
  fetchProjectsForUser,
  upsertProject,
} from "@/lib/supabase/projects";

const PROJECTS_KEY = "ecd-projects";

function withUpdatedPricing(project: Project): Project {
  const fee = professionalFeeForRoute(project.route, project.over22Path);
  return {
    ...project,
    pricing: calculatePricing(fee),
  };
}

function nextProjectId(existing: Project[]): string {
  const nums = existing
    .map((p) => {
      const match = p.id.match(/(\d+)$/);
      if (!match) return Number.NaN;
      return Number.parseInt(match[1].slice(-5), 10);
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 120) + 1;
  return `SB12-${String(next).padStart(5, "0")}`;
}

function readLocalProjects(userId: string): Project[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = localStorage.getItem(`${PROJECTS_KEY}:${userId}`);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

function writeLocalProjects(userId: string, projects: Project[]) {
  if (typeof window === "undefined" || !userId) return;
  localStorage.setItem(`${PROJECTS_KEY}:${userId}`, JSON.stringify(projects));
}

function ensureLocalDemoProjects(userId: string, email?: string) {
  if (typeof window === "undefined" || email !== DEMO_USER.email) return;
  const key = `${PROJECTS_KEY}:${userId}`;
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, JSON.stringify(seedDemoProjects()));
  }
}

async function ensureSupabaseDemoProjects(userId: string, email?: string) {
  if (email !== DEMO_USER.email) return;
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;

  const existing = await fetchProjectsForUser(supabase, userId);
  if (existing.length > 0) return;

  for (const project of seedDemoProjects()) {
    await upsertProject(supabase, project, userId);
  }
}

interface ProjectContextValue {
  projects: Project[];
  ready: boolean;
  usingSupabase: boolean;
  isAdminScope: boolean;
  scopeUserId: string | null;
  getProject: (id: string) => Project | undefined;
  createProject: () => Promise<Project>;
  saveProject: (project: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => Project | undefined;
  deleteProject: (id: string) => Promise<boolean>;
  canDeleteProject: (project: Project) => boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const scopeUserId = useProjectScopeUserId();
  const usingSupabase = isSupabaseConfigured();
  const userId = scopeUserId ?? user?.id ?? "";
  const isAdminScope = Boolean(scopeUserId && scopeUserId !== user?.id);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setReady(true);
      return;
    }

    let active = true;
    setReady(false);

    const load = async () => {
      try {
        if (usingSupabase) {
          const supabase = createSupabaseBrowserClient();
          if (!supabase) throw new Error("Supabase client unavailable");
          if (!isAdminScope) {
            await ensureSupabaseDemoProjects(userId, user?.email);
          }
          const remote = await fetchProjectsForUser(supabase, userId);
          if (active) setProjects(remote.map(withUpdatedPricing));
        } else {
          ensureLocalDemoProjects(userId, user?.email);
          if (active) setProjects(readLocalProjects(userId).map(withUpdatedPricing));
        }
      } catch {
        ensureLocalDemoProjects(userId, user?.email);
        if (active) setProjects(readLocalProjects(userId).map(withUpdatedPricing));
      } finally {
        if (active) setReady(true);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [userId, user?.email, usingSupabase, isAdminScope]);

  const persistLocal = useCallback(
    (next: Project[]) => {
      setProjects(next);
      writeLocalProjects(userId, next);
    },
    [userId],
  );

  const persistRemote = useCallback(
    async (project: Project) => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase || !userId) return;
      await upsertProject(supabase, project, userId);
    },
    [userId],
  );

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  );

  const createProject = useCallback(async () => {
    const project = withUpdatedPricing(
      createEmptyProject(nextProjectId(projectsRef.current)),
    );
    const next = [project, ...projectsRef.current];
    setProjects(next);

    if (usingSupabase) {
      try {
        await persistRemote(project);
      } catch {
        writeLocalProjects(userId, next);
      }
    } else {
      writeLocalProjects(userId, next);
    }

    return project;
  }, [persistRemote, userId, usingSupabase]);

  const saveProject = useCallback(
    (project: Project) => {
      const updated = withUpdatedPricing({
        ...project,
        updatedAt: new Date().toISOString(),
      });
      const exists = projectsRef.current.some((p) => p.id === updated.id);
      const next = exists
        ? projectsRef.current.map((p) => (p.id === updated.id ? updated : p))
        : [updated, ...projectsRef.current];

      setProjects(next);

      if (usingSupabase) {
        void persistRemote(updated).catch(() => writeLocalProjects(userId, next));
      } else {
        writeLocalProjects(userId, next);
      }
    },
    [persistRemote, userId, usingSupabase],
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<Project>) => {
      const current = projectsRef.current.find((p) => p.id === id);
      if (!current) return undefined;
      const nextProject = withUpdatedPricing({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      const next = projectsRef.current.map((p) => (p.id === id ? nextProject : p));
      setProjects(next);

      if (usingSupabase) {
        void persistRemote(nextProject).catch(() => writeLocalProjects(userId, next));
      } else {
        writeLocalProjects(userId, next);
      }

      return nextProject;
    },
    [persistRemote, userId, usingSupabase],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const current = projectsRef.current.find((p) => p.id === id);
      if (!current || !canDeleteProject(current)) return false;

      const next = projectsRef.current.filter((p) => p.id !== id);
      setProjects(next);

      if (usingSupabase) {
        try {
          const supabase = createSupabaseBrowserClient();
          if (supabase) await deleteProjectRow(supabase, id, userId);
        } catch {
          writeLocalProjects(userId, next);
          return false;
        }
      } else {
        writeLocalProjects(userId, next);
      }

      return true;
    },
    [userId, usingSupabase],
  );

  const value = useMemo(
    () => ({
      projects,
      ready,
      usingSupabase,
      isAdminScope,
      scopeUserId: scopeUserId ?? null,
      getProject,
      createProject,
      saveProject,
      updateProject,
      deleteProject,
      canDeleteProject,
    }),
    [projects, ready, usingSupabase, isAdminScope, scopeUserId, getProject, createProject, saveProject, updateProject, deleteProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
}
