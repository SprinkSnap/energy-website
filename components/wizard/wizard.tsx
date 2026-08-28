"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WizardProgress } from "@/components/wizard/progress";
import { StepService } from "@/components/wizard/step-service";
import { StepProject } from "@/components/wizard/step-project";
import { StepFoundation } from "@/components/wizard/step-foundation";
import { StepInsulation } from "@/components/wizard/step-insulation";
import { StepWindows } from "@/components/wizard/step-windows";
import { StepMechanical } from "@/components/wizard/step-mechanical";
import { StepDrawings } from "@/components/wizard/step-drawings";
import { StepReview } from "@/components/wizard/step-review";
import { WIZARD_FLOW_STEPS, type WizardStepId } from "@/lib/constants";
import { nextStatusAfterSubmit } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-context";
import type { Project } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";

function normalizeStep(step: WizardStepId | undefined): WizardStepId {
  return !step || step === "account" ? "service" : step;
}

function validate(step: WizardStepId, project: Project): string | null {
  if (step === "service") {
    if (!project.route) return "Select a service route to continue.";
    if (project.route === "over-22-wwr" && !project.over22Path) {
      return "Select Path 1 or Path 2 for the over-22% WWR route.";
    }
  }
  if (step === "project") {
    if (!project.info.builder || !project.info.modelName || !project.info.city) {
      return "Builder, model name, and city are required.";
    }
  }
  if (step === "foundation" && project.foundations.length === 0) {
    return "Select at least one foundation type.";
  }
  if (step === "review" && !project.confirmed) {
    return "Please confirm the project information before submitting.";
  }
  return null;
}

export function ProjectWizard({ projectId }: { projectId: string }) {
  const { getProject, saveProject, ready } = useProjects();
  const { user } = useAuth();
  const router = useRouter();
  const stored = getProject(projectId);
  const [error, setError] = useState<string>();

  const project = stored;
  const step = normalizeStep(project?.wizardStep);
  const stepIndex = Math.max(
    0,
    WIZARD_FLOW_STEPS.findIndex((item) => item.id === step),
  );

  useEffect(() => {
    trackEvent("project_wizard_started", { projectId });
  }, [projectId]);

  const patch = useCallback(
    (next: Partial<Project>) => {
      if (!project) return;
      saveProject({ ...project, ...next });
    },
    [project, saveProject],
  );

  const go = (nextStep: WizardStepId) => {
    patch({ wizardStep: nextStep === "account" ? "service" : nextStep });
    setError(undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const continueStep = () => {
    if (!project) return;
    const message = validate(step, project);
    if (message) {
      setError(message);
      return;
    }
    if (step === "review") {
      const status = nextStatusAfterSubmit(project.route);
      saveProject({
        ...project,
        status,
        payment: "unpaid",
        wizardStep: "review",
      });
      toast.success("Project submitted for Energy Compliant Design review.");
      router.push(`/portal/projects/${project.id}/submitted`);
      return;
    }
    const next = WIZARD_FLOW_STEPS[stepIndex + 1];
    if (next) go(next.id);
  };

  const back = () => {
    const prev = WIZARD_FLOW_STEPS[stepIndex - 1];
    if (prev) go(prev.id);
  };

  const body = useMemo(() => {
    if (!project) return null;
    switch (step) {
      case "service":
        return <StepService project={project} onChange={patch} />;
      case "project":
        return <StepProject project={project} onChange={patch} />;
      case "foundation":
        return <StepFoundation project={project} onChange={patch} />;
      case "insulation":
        return <StepInsulation project={project} onChange={patch} />;
      case "windows":
        return <StepWindows project={project} onChange={patch} />;
      case "mechanical":
        return <StepMechanical project={project} onChange={patch} />;
      case "drawings":
        return <StepDrawings project={project} onChange={patch} />;
      case "review":
        return <StepReview project={project} onChange={patch} />;
      default:
        return <StepService project={project} onChange={patch} />;
    }
  }, [project, step, patch]);

  if (!ready) {
    return <p className="p-8 text-sm text-muted-foreground">Loading project…</p>;
  }

  if (!project) {
    return <p className="p-8 text-sm text-muted-foreground">Project not found.</p>;
  }

  const locked = project.status !== "draft";

  return (
    <div className="pb-28 lg:pb-10">
      <WizardProgress current={step} onSelect={locked ? undefined : go} />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_16rem] lg:px-8">
        <div>{body}</div>
        <aside className="hidden rounded-2xl border border-border bg-white p-4 text-sm shadow-sm lg:block">
          <p className="font-semibold text-charcoal">{project.id}</p>
          <p className="mt-1 text-muted-foreground">
            {project.info.modelName || "New project"}
          </p>
          <p className="mt-4 text-xs tracking-wide text-muted-foreground uppercase">
            Signed in as
          </p>
          <p className="mt-1 font-medium">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          <p className="mt-4 text-xs tracking-wide text-muted-foreground uppercase">
            Current step
          </p>
          <p className="mt-1 font-medium">{WIZARD_FLOW_STEPS[stepIndex]?.label}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {stepIndex + 1} of {WIZARD_FLOW_STEPS.length} — completed steps are
            clickable if you need to go back.
          </p>
        </aside>
      </div>
      {error ? (
        <p
          className="mx-auto max-w-7xl px-4 text-sm text-destructive sm:px-6 lg:px-8"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-7xl justify-between gap-3 px-1 sm:px-6 lg:px-8">
          <Button variant="outline" size="lg" onClick={back} disabled={stepIndex === 0}>
            Back
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {locked ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => router.push(`/portal/projects/${project.id}`)}
              >
                Back to project
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => {
                    toast.success("Progress saved. You can continue later.");
                    router.push(`/portal/projects/${project.id}`);
                  }}
                >
                  Save & exit
                </Button>
                {step === "review" ? (
                  <>
                    <Button variant="outline" size="lg" onClick={() => go("project")}>
                      Edit details
                    </Button>
                    <Button variant="brand" size="lg" onClick={continueStep}>
                      Submit project
                    </Button>
                  </>
                ) : (
                  <Button variant="brand" size="lg" onClick={continueStep}>
                    Continue
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
