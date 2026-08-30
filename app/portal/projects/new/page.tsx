"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/project-context";

export default function NewProjectPage() {
  const { createProject, ready } = useProjects();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;

    let active = true;

    const run = async () => {
      const project = await createProject();
      if (active) router.replace(`/portal/projects/${project.id}/wizard`);
    };

    void run();
    return () => {
      active = false;
    };
  }, [ready, createProject, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Creating project…
    </div>
  );
}
