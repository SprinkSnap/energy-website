"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProjects } from "@/lib/project-context";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DeleteProjectButton({
  project,
  redirectTo = "/portal",
  variant = "outline",
  className,
}: {
  project: Project;
  redirectTo?: string;
  variant?: "outline" | "ghost" | "destructive";
  className?: string;
}) {
  const { deleteProject, canDeleteProject } = useProjects();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canDeleteProject(project)) return null;

  const confirmDelete = async () => {
    setBusy(true);
    const ok = await deleteProject(project.id);
    setBusy(false);
    if (!ok) {
      toast.error("This project cannot be deleted after the deposit is paid.");
      return;
    }
    toast.success("Project deleted.");
    setOpen(false);
    router.push(redirectTo);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={variant}
            className={cn("min-h-10", className)}
          />
        }
      >
        <Trash2 className="size-4" aria-hidden />
        Delete project
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {project.id}?</DialogTitle>
          <DialogDescription>
            This removes the draft and any uploaded details. You can delete any
            project before the first 50% deposit is paid. After deposit, contact
            support to make changes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={confirmDelete}
          >
            Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
