"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRightIcon, CircleAlertIcon, GitForkIcon, GitBranchIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { useOrganizations } from "@/components/organization-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { configureGithubWebhook, disconnectRepository, getGithubWebhookStatus, listRepositories, repositoryInstallUrl, triggerRepositorySync, type GithubWebhookStatus } from "@/lib/api";
import type { RepositoryRecord } from "@/types/project-type";

function statusLabel(status: RepositoryRecord["syncStatus"]) {
  switch (status) {
    case "queued": return "Sync queued";
    case "running": return "Syncing";
    case "complete": return "Up to date";
    case "partial": return "Partial sync";
    case "failed": return "Sync failed";
    default: return "Not synced";
  }
}

export default function RepositoriesPage() {
  const search = useSearchParams();
  const { activeOrg, activeOrgId, isLoading: orgLoading } = useOrganizations();
  const [repositoryState, setRepositoryState] = useState<{ orgId: string; repositories: RepositoryRecord[] } | null>(null);
  const [loadError, setLoadError] = useState<{ orgId: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [webhookState, setWebhookState] = useState<{ orgId: string; value: GithubWebhookStatus } | null>(null);
  const [webhookError, setWebhookError] = useState<{ orgId: string; message: string } | null>(null);
  const [webhookPending, setWebhookPending] = useState(false);
  const [pendingSync, setPendingSync] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<RepositoryRecord | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const reload = useCallback(async (orgId: string, signal?: AbortSignal) => {
    try {
      const { repositories } = await listRepositories({ organizationId: orgId }, signal);
      if (!signal?.aborted) {
        setRepositoryState({ orgId, repositories });
        setLoadError(null);
      }
    } catch (error) {
      if (!signal?.aborted) setLoadError({ orgId, message: error instanceof Error ? error.message : "Could not load repositories" });
    }
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => reload(activeOrgId, controller.signal));
    return () => controller.abort();
  }, [activeOrgId, reload, retry]);

  const repositories = useMemo(
    () => repositoryState?.orgId === activeOrgId ? repositoryState.repositories : [],
    [activeOrgId, repositoryState],
  );
  const isLoading = orgLoading || (!!activeOrgId && repositoryState?.orgId !== activeOrgId && loadError?.orgId !== activeOrgId);
  const error = loadError?.orgId === activeOrgId ? loadError.message : "";
  const webhook = webhookState?.orgId === activeOrgId ? webhookState.value : null;
  const isAdmin = activeOrg?.role === "admin";
  const syncActive = useMemo(() => repositories.some((repo) => repo.syncStatus === "queued" || repo.syncStatus === "running"), [repositories]);

  useEffect(() => {
    if (!activeOrgId || !isAdmin) return;
    const controller = new AbortController();
    getGithubWebhookStatus(activeOrgId, controller.signal)
      .then(({ webhook: value }) => { if (!controller.signal.aborted) { setWebhookState({ orgId: activeOrgId, value }); setWebhookError(null); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setWebhookError({ orgId: activeOrgId, message: reason instanceof Error ? reason.message : "Could not check the GitHub App" }); });
    return () => controller.abort();
  }, [activeOrgId, isAdmin]);

  useEffect(() => {
    if (!activeOrgId || !syncActive) return;
    const timer = setInterval(() => void reload(activeOrgId), 4000);
    return () => clearInterval(timer);
  }, [activeOrgId, reload, syncActive]);

  const githubResult = search.get("github");
  const callbackMessage = githubResult === "connected"
    ? `GitHub connected to ${search.get("account") ?? "your organization"}. ${search.get("attached") ?? "0"} repositories attached${search.get("skipped") !== "0" ? `; ${search.get("skipped")} skipped` : "."}`
    : githubResult === "updated" ? "GitHub App settings updated."
      : githubResult === "error" ? search.get("message") ?? "GitHub connection failed."
        : "";

  async function syncRepository(repo: RepositoryRecord) {
    setPendingSync(repo.id);
    try {
      await triggerRepositorySync(repo.id);
      toast.add({ type: "success", description: `Sync queued for ${repo.fullName}` });
      if (activeOrgId) await reload(activeOrgId);
    } catch (reason) {
      toast.add({ type: "error", description: reason instanceof Error ? reason.message : "Could not queue repository sync" });
    } finally { setPendingSync(null); }
  }

  async function configureWebhook() {
    if (!activeOrgId) return;
    setWebhookPending(true);
    try {
      const { webhook: value } = await configureGithubWebhook(activeOrgId);
      setWebhookState({ orgId: activeOrgId, value }); setWebhookError(null);
      toast.add({ type: value.configured ? "success" : "error", description: value.configured ? "GitHub webhook registered" : "Webhook configured; finish the remaining GitHub App settings below" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not configure the webhook";
      setWebhookError({ orgId: activeOrgId, message });
      toast.add({ type: "error", description: message });
    } finally { setWebhookPending(false); }
  }

  async function confirmDisconnect() {
    if (!disconnecting || !activeOrgId) return;
    setIsDisconnecting(true);
    try {
      await disconnectRepository(disconnecting.id);
      toast.add({ type: "success", description: `${disconnecting.fullName} disconnected` });
      setDisconnecting(null);
      await reload(activeOrgId);
    } catch (reason) { toast.add({ type: "error", description: reason instanceof Error ? reason.message : "Could not disconnect repository" }); }
    finally { setIsDisconnecting(false); }
  }

  return <SidebarInset id="main-content">
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
      <SidebarTrigger className="-ml-1" /><Separator orientation="vertical" className="mr-2 h-4" /><h1 className="font-heading text-lg font-semibold">Repositories</h1>
    </header>
    <div className="flex flex-1 flex-col gap-5 p-4 pt-2 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">Connect GitHub repositories to sync commits, pull requests, issues, branches, and deployments.</p></div>{isAdmin && activeOrgId && <Button render={<Link href={repositoryInstallUrl(activeOrgId)} />}><GitForkIcon aria-hidden="true" /> Connect GitHub</Button>}</div>
      {callbackMessage && <Alert variant={githubResult === "error" ? "destructive" : "default"}><GitForkIcon aria-hidden="true" /><AlertTitle>{githubResult === "error" ? "GitHub connection needs attention" : "GitHub connection updated"}</AlertTitle><AlertDescription>{callbackMessage}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><CircleAlertIcon aria-hidden="true" /><AlertTitle>Repositories could not load</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-2"><span>{error}</span><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Try again</Button></AlertDescription></Alert>}
      {isAdmin && <WebhookSetup webhook={webhook} error={webhookError?.orgId === activeOrgId ? webhookError.message : ""} pending={webhookPending} onConfigure={() => void configureWebhook()} />}
      <Card>
        <CardHeader><CardTitle>Connected repositories</CardTitle><CardDescription>{activeOrg?.name ?? "Active organization"} · {repositories.length} connected</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />) : repositories.length ? repositories.map((repo) => <div key={repo.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <GitForkIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1"><Link className="truncate font-medium hover:underline" href={`/dashboard/repositories/${repo.id}`}>{repo.fullName}</Link><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{repo.isPrivate ? "Private" : "Public"}</span>{repo.language && <span>{repo.language}</span>}{repo.defaultBranch && <span className="inline-flex items-center gap-1"><GitBranchIcon className="size-3" aria-hidden="true" />{repo.defaultBranch}</span>}</div></div>
            <div className="flex min-w-32 flex-col text-xs"><span className={repo.syncStatus === "failed" ? "font-medium text-destructive" : "font-medium"}>{statusLabel(repo.syncStatus)}</span><span className="text-muted-foreground">{repo.lastSyncedAt ? `Last synced ${new Date(repo.lastSyncedAt).toLocaleString()}` : repo.syncStartedAt ? `Started ${new Date(repo.syncStartedAt).toLocaleString()}` : "Waiting for first sync"}</span>{repo.syncTruncated && <span className="text-status-hold">Page limit reached</span>}</div>
            {isAdmin && <><Button size="sm" variant="outline" disabled={pendingSync === repo.id || repo.syncStatus === "queued" || repo.syncStatus === "running"} onClick={() => void syncRepository(repo)}><RefreshCwIcon aria-hidden="true" className={repo.syncStatus === "running" ? "animate-spin" : ""} />{repo.syncStatus === "running" || pendingSync === repo.id ? "Syncing…" : "Sync now"}</Button><Button size="icon-sm" variant="ghost" aria-label={`Disconnect ${repo.fullName}`} onClick={() => setDisconnecting(repo)}><UnplugIcon aria-hidden="true" /></Button></>}
          </div>) : <div className="rounded-lg border border-dashed p-8 text-center"><p className="font-medium">No repositories connected</p><p className="mt-1 text-sm text-muted-foreground">Connect the GitHub App to choose repositories for this organization.</p>{isAdmin && activeOrgId && <Button className="mt-4" render={<Link href={repositoryInstallUrl(activeOrgId)} />}><GitForkIcon aria-hidden="true" />Connect GitHub</Button>}</div>}
        </CardContent>
      </Card>
      <Dialog open={disconnecting !== null} onOpenChange={(open) => { if (!open && !isDisconnecting) setDisconnecting(null); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Disconnect {disconnecting?.fullName}?</DialogTitle><DialogDescription>CodePulse will stop syncing this repository. Its synced history will be removed from this organization.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={isDisconnecting} onClick={() => setDisconnecting(null)}>Cancel</Button><Button variant="destructive" disabled={isDisconnecting} onClick={() => void confirmDisconnect()}>{isDisconnecting ? "Disconnecting…" : "Disconnect repository"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  </SidebarInset>;
}

function WebhookSetup({ webhook, error, pending, onConfigure }: { webhook: GithubWebhookStatus | null; error: string; pending: boolean; onConfigure: () => void }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><GitForkIcon className="size-4" aria-hidden="true" />GitHub App webhook</CardTitle><CardDescription>Receive changes as they happen. Manual and daily syncs remain available if events are delayed.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    {error ? <Alert variant="destructive"><AlertTitle>Could not check webhook setup</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : !webhook ? <Skeleton className="h-12 w-full" /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{webhook.configured ? "Webhook URL and signing secret are registered" : webhook.appConfigured ? "Webhook needs registration" : "GitHub App is not configured"}</p><p className="text-xs text-muted-foreground">{webhook.callbackUrl || "Set GITHUB_WEBHOOK_URL and GITHUB_WEBHOOK_SECRET on the server."}</p></div>{webhook.appUrl && <Button variant="outline" size="sm" render={<a href={webhook.appUrl} target="_blank" rel="noreferrer" />}><ArrowUpRightIcon aria-hidden="true" />GitHub App settings</Button>}</div>
      {webhook.missingEvents.length > 0 && <p className="text-sm text-status-hold">Subscribe to these events in GitHub App settings: {webhook.missingEvents.join(", ")}.</p>}
      {webhook.missingPermissions.length > 0 && <p className="text-sm text-status-hold">Grant read access to these repository permissions: {webhook.missingPermissions.join(", ")}.</p>}
      {webhook.appConfigured && <Button className="self-start" variant="outline" onClick={onConfigure} disabled={pending}>{pending ? "Registering…" : "Register webhook URL"}</Button>}
    </>}
  </CardContent></Card>;
}
