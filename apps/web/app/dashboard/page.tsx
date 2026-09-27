"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CreateProjectDialog from "@/components/create-project-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { InvitationBanner } from "@/components/invitation-banner";
import { useOrganizations } from "@/components/organization-provider";
import { toast } from "@/components/ui/toast";
import { createProject, listProjects } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import {
  FolderCodeIcon,
  ArchiveIcon,
  Building2Icon,
  CircleAlertIcon,
} from "lucide-react";
import type { ProjectRecord, ProjectType } from "@/types/project-type";
import { DataTable } from "./data-table";
import { getColumns } from "./columns";

const EMPTY_PROJECTS: ProjectRecord[] = [];

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for this toggle: it makes the view
  // shareable, survives reloads and responds to back/forward for free.
  const showArchived = searchParams.get("archived") === "1";

  const [isOpen, setIsOpen] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [loadError, setLoadError] = useState<{
    orgId: string;
    archived: boolean;
    retryVersion: number;
    message: string;
  } | null>(null);
  // Keyed by org so switching organizations can never show the previous
  // organization's rows, and so "loading" is derived rather than stored.
  const [loaded, setLoaded] = useState<{
    orgId: string;
    archived: boolean;
    projects: ProjectRecord[];
  } | null>(null);

  const { activeOrg, activeOrgId, isLoading: isLoadingOrgs } =
    useOrganizations();

  function toggleArchived() {
    const params = new URLSearchParams(searchParams.toString());
    if (showArchived) {
      params.delete("archived");
    } else {
      params.set("archived", "1");
    }
    const query = params.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard", {
      scroll: false,
    });
  }

  useEffect(() => {
    // With no organization there is nothing to fetch. Returning early without
    // touching state used to leave the skeleton up forever, because the
    // loading flag was never cleared and the "no organization" state below was
    // unreachable. It is now derived, so this branch needs no setState.
    const orgId = activeOrgId;
    if (!orgId) {
      return;
    }

    const controller = new AbortController();

    // Arrow function, not a declaration: a hoisted declaration would lose the
    // `orgId` non-null narrowing above.
    const load = async () => {
      try {
        const { projects } = await listProjects(
          { archived: showArchived, organizationId: orgId },
          controller.signal,
        );
        setLoaded({ orgId, archived: showArchived, projects });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setLoadError({
          orgId,
          archived: showArchived,
          retryVersion,
          message:
            error instanceof Error ? error.message : "Could not load projects",
        });
      }
    };

    void load();

    return () => controller.abort();
  }, [showArchived, activeOrgId, retryVersion]);

  // Stale-while-revalidating: keep showing the current org's rows while a new
  // filter or org loads, but never another org's rows.
  const matchesLoaded =
    loaded !== null &&
    loaded.orgId === activeOrgId &&
    loaded.archived === showArchived;

  const hasLoadError =
    loadError !== null &&
    loadError.orgId === activeOrgId &&
    loadError.archived === showArchived &&
    loadError.retryVersion === retryVersion;

  const projectData = matchesLoaded ? loaded.projects : EMPTY_PROJECTS;
  const isLoading = Boolean(activeOrgId) && !matchesLoaded && !hasLoadError;

  const handleChanged = useCallback((project: ProjectRecord) => {
    setLoaded((current) =>
      current
        ? {
            ...current,
            projects: current.projects.map((item) =>
              item.id === project.id ? project : item,
            ),
          }
        : current,
    );
  }, []);

  const handleDeleted = useCallback((projectId: string) => {
    setLoaded((current) =>
      current
        ? {
            ...current,
            projects: current.projects.filter((item) => item.id !== projectId),
          }
        : current,
    );
  }, []);

  const columns = useMemo(
    () => getColumns({ onChanged: handleChanged, onDeleted: handleDeleted }),
    [handleChanged, handleDeleted],
  );

  const stats = useMemo(() => {
    const ongoing = projectData.filter((p) => p.status === "ongoing").length;
    const atRisk = projectData.filter(
      (p) => p.status === "behind schedule" || p.status === "on hold",
    ).length;
    const budget = projectData.reduce((sum, p) => sum + (p.budget ?? 0), 0);

    return [
      { label: "Total projects", value: String(projectData.length) },
      { label: "Ongoing", value: String(ongoing) },
      { label: "Needs attention", value: String(atRisk) },
      { label: "Combined budget", value: formatCurrency(budget) },
    ];
  }, [projectData]);

  async function handleCreateProject(data: ProjectType) {
    try {
      if (!activeOrgId) {
        throw new Error("Create or select an organization first");
      }

      const { project } = await createProject({
        ...data,
        organizationId: activeOrgId,
      });
      setIsOpen(false);
      setLoaded((current) =>
        current
          ? { ...current, projects: [project, ...current.projects] }
          : current,
      );
      toast.add({ type: "success", description: "New project created" });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Project creation failed",
      });
    }
  }

  return (
    <>
      <SidebarInset id="main-content">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:border-b-0 md:bg-transparent md:px-0 md:backdrop-blur-none transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">CodePulse</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {showArchived ? "Archived" : "Projects"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <InvitationBanner />

          {hasLoadError && (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <AlertTitle>Projects couldn’t load</AlertTitle>
                  <AlertDescription className="break-words">
                    {loadError?.message ?? "Could not load projects."} You can
                    retry without losing this page.
                  </AlertDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit shrink-0"
                  onClick={() => setRetryVersion((current) => current + 1)}
                >
                  Try again
                </Button>
              </div>
            </Alert>
          )}

          <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
              <div className="flex flex-col gap-1">
                <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
                  {showArchived ? "Archived projects" : "Projects"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isLoadingOrgs
                    ? "Loading organizations…"
                    : !activeOrg
                      ? "You are not a member of any organization yet."
                      : isLoading
                        ? `Loading ${activeOrg.name} projects…`
                        : showArchived
                          ? "Projects you have archived. Restore one to bring it back."
                          : projectData.length === 0
                            ? `${activeOrg.name} has no projects yet.`
                            : `${projectData.length} ${
                                projectData.length === 1 ? "project" : "projects"
                              } tracked in ${activeOrg.name}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  aria-pressed={showArchived}
                  onClick={toggleArchived}
                >
                  <ArchiveIcon aria-hidden="true" />
                  {showArchived ? "View Active" : "View Archived"}
                </Button>
                {!showArchived && activeOrg && (
                  <CreateProjectDialog
                    isOpen={isOpen}
                    setIsOpen={setIsOpen}
                    handleCreateProject={handleCreateProject}
                  />
                )}
              </div>
          </div>

          {!showArchived && activeOrg && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.label} size="sm">
                  <CardContent className="flex flex-col gap-1">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {stat.label}
                    </span>
                    <span className="font-heading text-2xl font-semibold tabular-nums">
                      {isLoading ? (
                        <Skeleton className="h-7 w-16" />
                      ) : (
                        stat.value
                      )}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {isLoading || isLoadingOrgs ? (
            <div className="flex flex-col gap-3 rounded-xl border p-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="ml-auto h-4 w-16" />
                </div>
              ))}
            </div>
          ) : hasLoadError && !matchesLoaded ? null : !activeOrg ? (
            <div className="rounded-xl border">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant={"icon"}>
                    <Building2Icon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No organization</EmptyTitle>
                  <EmptyDescription>
                    Create an organization from the switcher in the sidebar to
                    start tracking projects.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : projectData.length === 0 ? (
            <div className="rounded-xl border">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant={"icon"}>
                    <FolderCodeIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {showArchived ? "No archived projects" : "No projects yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {showArchived
                      ? "Projects you archive will show up here, ready to restore."
                      : "Create your first project to start tracking budget, schedule and status."}
                  </EmptyDescription>
                </EmptyHeader>
                {!showArchived && (
                  <EmptyContent className="flex-row justify-center gap-2">
                    <Button onClick={() => setIsOpen(true)}>
                      Create Project
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            </div>
          ) : (
            <DataTable columns={columns} data={projectData} />
          )}
        </div>
      </SidebarInset>
    </>
  );
}
