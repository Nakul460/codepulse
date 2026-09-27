"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, ArrowUpRightIcon, GitBranchIcon, GitForkIcon, GitPullRequestIcon, CircleDotIcon, RocketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getRepositoryData, type RepositoryData } from "@/lib/api";

export default function RepositoryDetailPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const [data, setData] = useState<RepositoryData | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const loading = loadedId !== repoId && !error;

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await getRepositoryData(repoId, signal);
      if (!signal?.aborted) { setData(result); setLoadedId(repoId); setError(""); }
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Could not load repository data"); }
  }, [repoId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load]);

  const repository = loadedId === repoId ? data?.repository : null;

  return <SidebarInset id="main-content">
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none"><SidebarTrigger className="-ml-1" /><Separator orientation="vertical" className="mr-2 h-4" /><Link href="/dashboard/repositories" className="text-sm text-muted-foreground hover:text-foreground">Repositories</Link><span aria-hidden="true">/</span><span className="max-w-[45vw] truncate text-sm font-medium">{repository?.fullName ?? "Repository"}</span></header>
    <div className="flex flex-1 flex-col gap-5 p-4 pt-2 md:p-6">
      {error && <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">{error}<Button size="sm" variant="outline" className="ml-3" onClick={() => void load()}>Try again</Button></div>}
      {loading ? <div className="flex flex-col gap-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-48 w-full" /><Skeleton className="h-64 w-full" /></div> : repository && data && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><Button size="sm" variant="ghost" render={<Link href="/dashboard/repositories" />}><ArrowLeftIcon aria-hidden="true" />All repositories</Button><h1 className="mt-2 flex items-center gap-2 font-heading text-2xl font-semibold"><GitForkIcon className="size-5 text-muted-foreground" aria-hidden="true" />{repository.fullName}</h1><p className="mt-1 text-sm text-muted-foreground">{repository.language ?? "Repository"} · Default branch {repository.defaultBranch ?? "not set"} · {repository.isPrivate ? "Private" : "Public"}</p></div><Button variant="outline" render={<a href={repository.htmlUrl} target="_blank" rel="noreferrer" />}><ArrowUpRightIcon aria-hidden="true" />Open on GitHub</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Branches", data.branches.length], ["Commits", data.commits.length], ["Pull requests", data.pullRequests.length], ["GitHub issues", data.issues.length], ["Deployments", data.deployments.length]].map(([title, count]) => <Card key={title}><CardContent className="pt-4"><p className="font-heading text-2xl font-semibold tabular-nums">{count}</p><p className="text-xs text-muted-foreground">{title}</p></CardContent></Card>)}</div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><GitBranchIcon className="size-4" aria-hidden="true" />Branches</CardTitle><CardDescription>Recent branch tips and protection status.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{data.branches.length ? data.branches.map((branch) => <a key={branch.id} href={branch.htmlUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-muted/50"><span className="min-w-0 truncate font-medium">{branch.name}</span><span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{branch.protected ? "Protected" : "Unprotected"}<code>{branch.sha.slice(0, 7)}</code></span></a>) : <p className="text-sm text-muted-foreground">Branch data appears after the first sync.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><RocketIcon className="size-4" aria-hidden="true" />Deployments</CardTitle><CardDescription>Latest deployment state reported by GitHub.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{data.deployments.length ? data.deployments.map((deployment) => <div key={deployment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{deployment.environment || deployment.task || "Deployment"}<span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{deployment.state}</span></p><p className="mt-1 truncate text-xs text-muted-foreground">{deployment.ref} · {deployment.creatorUsername || "Unknown actor"}{deployment.createdAtGithub ? ` · ${new Date(deployment.createdAtGithub).toLocaleString()}` : ""}</p>{deployment.description && <p className="mt-1 text-xs text-muted-foreground">{deployment.description}</p>}</div>{(deployment.environmentUrl || deployment.logUrl) && <a href={deployment.environmentUrl || deployment.logUrl} target="_blank" rel="noreferrer" aria-label="Open deployment" className="rounded-md p-2 hover:bg-muted"><ArrowUpRightIcon className="size-4" aria-hidden="true" /></a>}</div>) : <p className="text-sm text-muted-foreground">No GitHub deployments recorded yet.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><GitPullRequestIcon className="size-4" aria-hidden="true" />Pull requests</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">{data.pullRequests.length ? data.pullRequests.map((pr) => <a key={pr.id} href={pr.htmlUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/50"><span className="min-w-0"><span className="block truncate text-sm font-medium">#{pr.number} {pr.title}</span><span className="text-xs text-muted-foreground">{pr.headBranch} → {pr.baseBranch} · {pr.authorUsername}</span></span><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs">{pr.merged ? "Merged" : pr.state}</span></a>) : <p className="text-sm text-muted-foreground">No pull requests synced yet.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><CircleDotIcon className="size-4" aria-hidden="true" />GitHub issues</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">{data.issues.length ? data.issues.map((issue) => <a key={issue.id} href={issue.htmlUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/50"><span className="min-w-0"><span className="block truncate text-sm font-medium">#{issue.number} {issue.title}</span><span className="text-xs text-muted-foreground">{issue.labels.slice(0, 3).join(" · ") || issue.authorUsername}</span></span><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs">{issue.state}</span></a>) : <p className="text-sm text-muted-foreground">No GitHub issues synced yet.</p>}</CardContent></Card>
          <Card className="xl:col-span-2"><CardHeader><CardTitle>Recent commits</CardTitle><CardDescription>Latest 100 commits available from the repository sync.</CardDescription></CardHeader><CardContent className="flex flex-col">{data.commits.length ? data.commits.map((commit) => <a key={commit.id} href={commit.url} target="_blank" rel="noreferrer" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-3 last:border-0 hover:bg-muted/30"><span className="min-w-0 flex-1 truncate text-sm">{commit.message.split("\n")[0] || "Commit"}</span><span className="shrink-0 text-xs text-muted-foreground">{commit.authorName || commit.authorUsername} · {commit.committedAt ? new Date(commit.committedAt).toLocaleString() : "date unknown"}</span><code className="text-xs text-muted-foreground">{commit.githubId.slice(0, 7)}</code></a>) : <p className="text-sm text-muted-foreground">Commit history appears after the first sync.</p>}</CardContent></Card>
        </div>
      </>}
    </div>
  </SidebarInset>;
}
