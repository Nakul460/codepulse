"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MoreHorizontalIcon,
  PencilIcon,
  EyeIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  Trash2Icon,
} from "lucide-react";
import { projectCan } from "@codepulse/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { archiveProject, deleteProject, restoreProject } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import type { ProjectRecord } from "@/types/project-type";

interface ProjectRowActionsProps {
  project: ProjectRecord;
  onChanged: (project: ProjectRecord) => void;
  onDeleted: (projectId: string) => void;
}

export function ProjectRowActions({
  project,
  onChanged,
  onDeleted,
}: ProjectRowActionsProps) {
  const [isPending, setIsPending] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const isArchived = project.archivedAt !== null;
  // Fall back so the accessible name is never "Actions for ".
  const label = project.projectName?.trim() || "Untitled project";
  // From the shared permission matrix, not a role comparison written here.
  // These used to be inline `project.role === "owner"` checks, which meant a
  // change to what a role could do had to be made in three places (here, the
  // project page, and the API service) and a miss was invisible.
  const canEdit = projectCan(project.role, "edit");
  const canDelete = projectCan(project.role, "delete");

  async function run(action: () => Promise<ProjectRecord | undefined>) {
    setIsPending(true);
    try {
      await action();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${label}`}
              disabled={isPending}
            >
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            render={<Link href={`/dashboard/projects/${project.id}`} />}
          >
            <EyeIcon aria-hidden="true" />
            Open
          </DropdownMenuItem>

          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <Link href={`/dashboard/projects/${project.id}?edit=1`} />
                }
              >
                <PencilIcon aria-hidden="true" />
                Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  run(async () => {
                    const { project: updated } = isArchived
                      ? await restoreProject(project.id)
                      : await archiveProject(project.id);
                    onChanged(updated);
                    toast.add({
                      type: "success",
                      description: isArchived
                        ? "Project restored"
                        : "Project archived",
                    });
                    return updated;
                  })
                }
              >
                {isArchived ? (
                  <ArchiveRestoreIcon aria-hidden="true" />
                ) : (
                  <ArchiveIcon aria-hidden="true" />
                )}
                {isArchived ? "Restore" : "Archive"}
              </DropdownMenuItem>
            </>
          )}

          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsConfirmingDelete(true)}
              >
                <Trash2Icon aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <DialogContent className="sm:max-w-sm max-h-[85svh] overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>Delete {label}?</DialogTitle>
            <DialogDescription>
              This permanently removes the project, its members and its full
              activity history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  await deleteProject(project.id);
                  setIsConfirmingDelete(false);
                  onDeleted(project.id);
                  toast.add({
                    type: "success",
                    description: "Project deleted",
                  });
                  return undefined;
                })
              }
            >
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
