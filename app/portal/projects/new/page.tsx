"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/project-context";

let creating = false;

export default function NewProjectPage() {
  const { createProject, ready } = useProjects();
  const router = useRouter();

  useEffect(() => {
    if (!ready || creating) return;
    creating = true;
    const project = createProject();
    router.replace(`/portal/projects/${project.id}/wizard`);
  }, [ready, createProject, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Creating project…
    </div>
  );
}
