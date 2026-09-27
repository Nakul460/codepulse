"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlusIcon, SearchIcon, CircleDotIcon } from "lucide-react";
import { useOrganizations } from "@/components/organization-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { createIssue, listIssues, listProjects, type IssuePriority, type IssueRecord, type IssueStatus } from "@/lib/api";
import type { ProjectRecord } from "@/types/project-type";

const STATUSES: IssueStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];
const PRIORITIES: IssuePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const EMPTY_ISSUES: IssueRecord[] = [];
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

export default function IssuesPage() {
  const searchParams = useSearchParams();
  const { activeOrg, activeOrgId, isLoading: orgLoading } = useOrganizations();
  const [data, setData] = useState<{ orgId: string; projects: ProjectRecord[]; issues: IssueRecord[] } | null>(null);
  const [loadError, setLoadError] = useState<{ orgId: string; retry: number; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ projectId: "", title: "", description: "", priority: "MEDIUM" as IssuePriority, labels: "" });

  useEffect(() => {
    if (!activeOrgId) return;
    const controller = new AbortController();
    listProjects({ organizationId: activeOrgId }, controller.signal)
      .then(async ({ projects: rows }) => {
        const all = await Promise.all(rows.map((project) => listIssues(project.id, {}, controller.signal)));
        if (!controller.signal.aborted) {
          setData({ orgId: activeOrgId, projects: rows, issues: all.flatMap((result) => result.issues) });
          setLoadError(null);
        }
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setLoadError({ orgId: activeOrgId, retry, message: reason instanceof Error ? reason.message : "Could not load issues" }); });
    return () => controller.abort();
  }, [activeOrgId, retry]);

  const currentData = data?.orgId === activeOrgId ? data : null;
  const projects = currentData?.projects ?? [];
  const issues = currentData?.issues ?? EMPTY_ISSUES;
  const error = loadError?.orgId === activeOrgId && loadError.retry === retry ? loadError.message : "";
  const isLoading = orgLoading || (!!activeOrgId && !currentData && !error);
  const visible = useMemo(() => issues.filter((issue) =>
    (statusFilter === "ALL" || issue.status === statusFilter) &&
    `${issue.title} ${issue.description} ${issue.labels.join(" ")}`.toLowerCase().includes(query.toLowerCase()),
  ), [issues, query, statusFilter]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectId = form.projectId || projects.find((project) => project.role !== "viewer")?.id;
    if (!projectId || !form.title.trim()) return;
    setIsSaving(true);
    try {
      const { issue } = await createIssue(projectId, { title: form.title, description: form.description, priority: form.priority, labels: form.labels.split(",").map((entry) => entry.trim()).filter(Boolean) });
      setData((current) => current?.orgId === activeOrgId ? { ...current, issues: [issue, ...current.issues] } : current);
      setLoadError(null);
      setForm((current) => ({ ...current, title: "", description: "", labels: "" }));
      setIsCreateOpen(false);
    } catch (reason) { setLoadError({ orgId: activeOrgId ?? "", retry, message: reason instanceof Error ? reason.message : "Could not create issue" }); }
    finally { setIsSaving(false); }
  }

  return <SidebarInset id="main-content">
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
      <SidebarTrigger className="-ml-1" /><Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="font-heading text-lg font-semibold">Issues</h1>
    </header>
    <div className="flex flex-1 flex-col gap-5 p-4 pt-2 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Track work across {activeOrg?.name ?? "your organization"}.</p></div>
        <Button onClick={() => setIsCreateOpen(true)} disabled={!projects.some((project) => project.role !== "viewer")}><PlusIcon aria-hidden="true" /> New issue</Button>
      </div>
      {error && <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 p-3 text-sm"><span>{error}</span><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Try again</Button></div>}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle>All issues <span className="ml-2 text-sm font-normal text-muted-foreground">{visible.length}</span></CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative"><SearchIcon className="absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search issues" placeholder="Search issues" className="w-48 pl-8" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <select aria-label="Filter by status" className="h-8 rounded-lg border bg-background px-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading || orgLoading ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />) : visible.length ? visible.map((issue) => {
            const project = projects.find((entry) => entry.id === issue.projectId);
            return <Link key={issue.id} href={`/dashboard/issues/${issue.id}${searchParams.get("org") ? `?org=${searchParams.get("org")}` : ""}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <CircleDotIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{issue.title}</span><span className="text-xs text-muted-foreground">{project?.projectName ?? "Project"}</span></span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs">{label(issue.status)}</span><span className="text-xs text-muted-foreground">{label(issue.priority)} priority</span>
              {issue.dueDate && <time className="text-xs text-muted-foreground" dateTime={issue.dueDate}>Due {new Date(issue.dueDate).toLocaleDateString()}</time>}
            </Link>;
          }) : <div className="rounded-lg border border-dashed p-8 text-center"><p className="font-medium">{issues.length ? "No matching issues" : "No issues yet"}</p><p className="mt-1 text-sm text-muted-foreground">Create an issue to start tracking work for a project.</p>{!issues.length && <Button className="mt-4" onClick={() => setIsCreateOpen(true)} disabled={!projects.length}><PlusIcon aria-hidden="true" /> Create your first issue</Button>}</div>}
        </CardContent>
      </Card>
    </div>
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Create issue</DialogTitle><DialogDescription>Add a task to one of your projects.</DialogDescription></DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">Project<select required className="h-9 rounded-lg border bg-background px-2" value={form.projectId || projects.find((project) => project.role !== "viewer")?.id || ""} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>{projects.filter((project) => project.role !== "viewer").map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 text-sm">Title<Input autoFocus required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What needs to be done?" /></label>
          <label className="flex flex-col gap-1.5 text-sm">Description<Textarea maxLength={20000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add context or acceptance criteria" /></label>
          <label className="flex flex-col gap-1.5 text-sm">Priority<select className="h-9 rounded-lg border bg-background px-2" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as IssuePriority })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 text-sm">Labels <Input value={form.labels} onChange={(event) => setForm({ ...form, labels: event.target.value })} placeholder="bug, frontend (comma separated)" /></label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={isSaving || !projects.length}>{isSaving ? "Creating…" : "Create issue"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </SidebarInset>;
}
