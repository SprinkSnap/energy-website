"use client";

import { use } from "react";
import { ProjectWizard } from "@/components/wizard/wizard";
import { ProjectScopeProvider } from "@/lib/project-scope";

export default function AdminWizardPage({
  params,
}: {
  params: Promise<{ userId: string; projectId: string }>;
}) {
  const { userId, projectId } = use(params);

  return (
    <ProjectScopeProvider clientUserId={userId}>
      <ProjectWizard projectId={projectId} />
    </ProjectScopeProvider>
  );
}
