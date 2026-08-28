import { ProjectWizard } from "@/components/wizard/wizard";

export default async function WizardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectWizard projectId={id} />;
}
