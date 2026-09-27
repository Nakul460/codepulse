"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectForm } from "@/components/project-form";
import { updateProject } from "@/lib/api";
import { toDate } from "@/lib/project-status";
import { toast } from "@/components/ui/toast";
import { EditProjectDialogProps, ProjectType } from "@/types/project-type";

function toFormValues(project: EditProjectDialogProps["project"]): ProjectType {
  return {
    projectName: project.projectName,
    description: project.description,
    status: project.status,
    startDate: toDate(project.startDate),
    endDate: toDate(project.endDate),
    budget: project.budget,
  };
}

export function EditProjectDialog({
  project,
  isOpen,
  onOpenChange,
  onSaved,
}: EditProjectDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setIsSubmitting(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85svh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update details for {project.projectName}.
          </DialogDescription>
        </DialogHeader>

        <ProjectForm
          // Remounts when the project changes and each time the dialog opens,
          // so the form never shows values from a previous edit.
          key={`${project.id}-${isOpen}`}
          idPrefix="edit"
          defaultValues={toFormValues(project)}
          submitLabel="Save Changes"
          isSubmitting={isSubmitting}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values) => {
            setIsSubmitting(true);
            try {
              const { project: updated } = await updateProject(
                project.id,
                values,
              );
              onSaved(updated);
              onOpenChange(false);
              toast.add({ type: "success", description: "Project updated" });
            } catch (error) {
              toast.add({
                type: "error",
                description:
                  error instanceof Error
                    ? error.message
                    : "Could not update project",
              });
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
