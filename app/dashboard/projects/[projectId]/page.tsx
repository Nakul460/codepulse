"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import {
  archiveProject,
  getProject,
  listActivity,
  listMembers,
  restoreProject,
} from "@/lib/api";
import { statusLabel, toDate } from "@/lib/project-status";
import { formatCurrency, formatLongDate } from "@/lib/format";
import { ArrowLeftIcon } from "lucide-react";
import type {
  ProjectActivityRecord,
  ProjectMemberRecord,
  ProjectRecord,
} from "@/types/project-type";
import { MembersPanel } from "./members-panel";
import { ActivityFeed } from "./activity-feed";

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId;

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [activity, setActivity] = useState<ProjectActivityRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMembersLoading, setIsMembersLoading] = useState(true);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [isArchiving, setIsArchiving] = useState(false);

  // The URL is the source of truth for the edit dialog, so no effect is
  // needed to open it from a link.
  const isEditOpen = searchParams.get("edit") === "1";

  const setEditOpen = useCallback(
    (open: boolean) => {
      router.replace(
        open ? `/dashboard/projects/${projectId}?edit=1` : `/dashboard/projects/${projectId}`,
      );
    },
    [router, projectId],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setIsMembersLoading(true);
      setIsActivityLoading(true);

      try {
        const [{ project: loaded }, { activity: loadedActivity }] =
          await Promise.all([
            getProject(projectId, controller.signal),
            listActivity(projectId, controller.signal),
          ]);

        setProject(loaded);
        setActivity(loadedActivity);

        // The roster is owner-only on the server (it exposes collaborator
        // emails), so it is only requested once we know the role. Fetching it
        // up front would 403 for editors and viewers.
        if (loaded.role === "owner") {
          const { members: loadedMembers } = await listMembers(
            projectId,
            controller.signal,
          );
          setMembers(loadedMembers);
        } else {
          setMembers([]);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        toast.add({
          type: "error",
          description:
            error instanceof Error ? error.message : "Could not load project",
        });
        if (error instanceof Error && /not found/i.test(error.message)) {
          router.replace("/dashboard");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsMembersLoading(false);
          setIsActivityLoading(false);
        }
      }
    }

    load();

    return () => controller.abort();
  }, [projectId, router]);

  const refreshActivity = useCallback(async () => {
    try {
      const { activity: fresh } = await listActivity(projectId);
      setActivity(fresh);
    } catch {
      // Non-critical; the feed just stays as-is.
    }
  }, [projectId]);

  const handleSaved = useCallback(
    (updated: ProjectRecord) => {
      setProject(updated);
      void refreshActivity();
    },
    [refreshActivity],
  );

  if (isLoading) {
    return (
      <>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-col gap-6 p-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        </SidebarInset>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-col items-start gap-4 p-6">
            <h1 className="font-heading text-xl font-semibold text-balance">
              Project unavailable
            </h1>
            <p className="text-sm text-muted-foreground">
              This project may have been deleted, or you may not have access.
            </p>
            <Button render={<Link href="/dashboard" />}>
              <ArrowLeftIcon aria-hidden="true" />
              Back to projects
            </Button>
          </div>
        </SidebarInset>
      </>
    );
  }

  const canEdit = project.role === "owner" || project.role === "editor";
  const canManageMembers = project.role === "owner";
  const isArchived = project.archivedAt !== null;

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Projects</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[16rem] truncate">
                    {project.projectName}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <main id="main-content" className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance break-words">
                  {project.projectName}
                </h1>
                {isArchived && (
                  <span className="rounded-full bg-status-hold/10 px-2 py-0.5 text-xs font-medium text-status-hold">
                    Archived
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {statusLabel(project.status)} · Created{" "}
                {formatLongDate(project.createdAt)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard" />}
              >
                <ArrowLeftIcon aria-hidden="true" />
                All projects
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isArchiving}
                    onClick={async () => {
                      setIsArchiving(true);
                      try {
                        const { project: updated } = isArchived
                          ? await restoreProject(project.id)
                          : await archiveProject(project.id);
                        setProject(updated);
                        void refreshActivity();
                        toast.add({
                          type: "success",
                          description: isArchived
                            ? "Project restored"
                            : "Project archived",
                        });
                      } catch (error) {
                        toast.add({
                          type: "error",
                          description:
                            error instanceof Error
                              ? error.message
                              : "Something went wrong",
                        });
                      } finally {
                        setIsArchiving(false);
                      }
                    }}
                  >
                    {isArchived ? "Restore" : "Archive"}
                  </Button>
                  <Button size="sm" onClick={() => setEditOpen(true)}>
                    Edit details
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {project.description ? (
                  <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No description yet.
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Detail
                    label="Status"
                    value={statusLabel(project.status)}
                  />
                  <Detail
                    label="Budget"
                    value={
                      <span className="tabular-nums">
                        {formatCurrency(project.budget)}
                      </span>
                    }
                  />
                  <Detail
                    label="Start date"
                    value={
                      formatLongDate(project.startDate) ?? (
                        <span className="text-muted-foreground">Not set</span>
                      )
                    }
                  />
                  <Detail
                    label="End date"
                    value={
                      formatLongDate(project.endDate) ?? (
                        <span className="text-muted-foreground">Not set</span>
                      )
                    }
                  />
                </div>

                {project.endDate &&
                toDate(project.startDate) &&
                new Date(project.endDate) < new Date(project.startDate!) ? (
                  <p
                    className="text-sm text-status-late"
                    role="alert"
                  >
                    End date falls before the start date. Update the dates so
                    the schedule reads correctly.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Members</CardTitle>
              </CardHeader>
              <CardContent>
                <MembersPanel
                  projectId={project.id}
                  canManage={canManageMembers}
                  members={members}
                  isLoading={isMembersLoading}
                  onChanged={setMembers}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed activity={activity} isLoading={isActivityLoading} />
            </CardContent>
          </Card>
        </main>
      </SidebarInset>

      <EditProjectDialog
        project={project}
        isOpen={isEditOpen}
        onOpenChange={setEditOpen}
        onSaved={handleSaved}
      />
    </>
  );
}
