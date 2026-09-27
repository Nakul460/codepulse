"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/project-form";
import { CreateProjectDialogProps, ProjectType } from "@/types/project-type";

const EMPTY: ProjectType = {
  projectName: "",
  description: "",
  status: "ongoing",
  startDate: undefined,
  endDate: undefined,
  budget: 0,
};

export default function CreateProjectDialog({
  handleCreateProject,
  isOpen,
  setIsOpen,
}: CreateProjectDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setIsSubmitting(false);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="default" aria-haspopup="dialog">
            <span>Create Project</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg max-h-[85svh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Track schedule, budget and status for a new project.
          </DialogDescription>
        </DialogHeader>

        <ProjectForm
          idPrefix="create"
          defaultValues={EMPTY}
          submitLabel="Create Project"
          isSubmitting={isSubmitting}
          onCancel={() => setIsOpen(false)}
          onSubmit={async (values) => {
            setIsSubmitting(true);
            try {
              await handleCreateProject(values);
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
