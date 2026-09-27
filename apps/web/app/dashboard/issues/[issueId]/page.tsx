"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, PaperclipIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { archiveIssue, createIssueComment, getIssue, listIssues, listMembers, updateIssue, type IssueActivityRecord, type IssueCommentRecord, type IssuePriority, type IssueRecord, type IssueStatus } from "@/lib/api";
import type { ProjectMemberRecord, MemberRole } from "@/types/project-type";

const STATUSES: IssueStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];
const PRIORITIES: IssuePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
const dateValue = (value: string | null) => value ? new Date(value).toISOString().slice(0, 10) : "";

export default function IssueDetailPage() {
  const { issueId } = useParams<{ issueId: string }>();
  const [issue, setIssue] = useState<IssueRecord | null>(null);
  const [role, setRole] = useState<MemberRole>("viewer");
  const [comments, setComments] = useState<IssueCommentRecord[]>([]);
  const [activity, setActivity] = useState<IssueActivityRecord[]>([]);
  const [projectIssues, setProjectIssues] = useState<IssueRecord[]>([]);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [loadedIssueId, setLoadedIssueId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [form, setForm] = useState({ title: "", description: "", status: "BACKLOG" as IssueStatus, priority: "MEDIUM" as IssuePriority, labels: "", assigneeId: "", dueDate: "", estimate: "", parentIssueId: "", relatedIssueIds: "" });
  const error = loadError?.id === issueId ? loadError.message : "";
  const isLoading = loadedIssueId !== issueId && !error;
  const currentIssue = loadedIssueId === issueId ? issue : null;

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await getIssue(issueId, signal);
      if (signal?.aborted) return;
      const current = result.issue;
      setIssue(current); setRole(result.role); setComments(result.comments); setActivity(result.activity);
      setLoadedIssueId(issueId); setLoadError(null);
      setForm({ title: current.title, description: current.description, status: current.status, priority: current.priority, labels: current.labels.join(", "), assigneeId: current.assigneeId ?? "", dueDate: dateValue(current.dueDate), estimate: current.estimate == null ? "" : String(current.estimate), parentIssueId: current.parentIssueId ?? "", relatedIssueIds: current.relatedIssueIds.join(",") });
      const [issueRows] = await Promise.all([listIssues(current.projectId, {}, signal)]);
      if (!signal?.aborted) setProjectIssues(issueRows.issues);
      if (result.role === "owner") {
        try { const roster = await listMembers(current.projectId, signal); if (!signal?.aborted) setMembers(roster.members); } catch { /* Owners may also inherit org scope without a direct roster. */ }
      }
    } catch (reason) { if (!signal?.aborted) setLoadError({ id: issueId, message: reason instanceof Error ? reason.message : "Could not load issue" }); }
  }, [issueId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!issue) return;
    setSaving(true);
    try {
      const { issue: updated } = await updateIssue(issue.id, {
        title: form.title, description: form.description, status: form.status, priority: form.priority,
        labels: form.labels.split(",").map((entry) => entry.trim()).filter(Boolean), assigneeId: form.assigneeId || null,
        dueDate: form.dueDate || null, estimate: form.estimate ? Number(form.estimate) : null,
        parentIssueId: form.parentIssueId || null,
        relatedIssueIds: form.relatedIssueIds.split(",").map((entry) => entry.trim()).filter(Boolean),
        attachments: issue.attachments,
      });
      setIssue(updated); toast.add({ type: "success", description: "Issue updated" }); void load();
    } catch (reason) { toast.add({ type: "error", description: reason instanceof Error ? reason.message : "Could not update issue" }); }
    finally { setSaving(false); }
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!issue || !comment.trim()) return;
    try {
      const { comment: created } = await createIssueComment(issue.id, comment, mentionIds);
      setComments((items) => [...items, created]); setComment(""); setMentionIds([]); void load();
    } catch (reason) { toast.add({ type: "error", description: reason instanceof Error ? reason.message : "Could not post comment" }); }
  }

  async function saveAttachment() {
    if (!issue || !attachmentName.trim() || !attachmentUrl.trim()) return;
    try {
      const { issue: updated } = await updateIssue(issue.id, { attachments: [...issue.attachments, { name: attachmentName.trim(), url: attachmentUrl.trim(), mimeType: "", size: 0, addedAt: null }] });
      setIssue(updated); setAttachmentName(""); setAttachmentUrl(""); void load();
    } catch (reason) { toast.add({ type: "error", description: reason instanceof Error ? reason.message : "Could not add attachment" }); }
  }

  async function toggleArchive() {
    if (!issue) return;
    try { await archiveIssue(issue.id); toast.add({ type: "success", description: issue.archivedAt ? "Issue restored" : "Issue archived" }); void load(); }
    catch (reason) { toast.add({ type: "error", description: reason instanceof Error ? reason.message : "Could not archive issue" }); }
  }

  return <SidebarInset id="main-content">
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none"><SidebarTrigger className="-ml-1" /><Separator orientation="vertical" className="mr-2 h-4" /><Link href="/dashboard/issues" className="text-sm text-muted-foreground hover:text-foreground">Issues</Link><span aria-hidden="true">/</span><span className="max-w-[45vw] truncate text-sm font-medium">{currentIssue?.title ?? "Issue"}</span></header>
    <div className="flex flex-1 flex-col gap-5 p-4 pt-2 md:p-6">
      {error && <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">{error}<Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>Try again</Button></div>}
      {isLoading ? <div className="flex flex-col gap-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-56 w-full" /></div> : currentIssue && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><Button variant="ghost" size="sm" render={<Link href="/dashboard/issues" />}><ArrowLeftIcon aria-hidden="true" />All issues</Button><p className="mt-2 text-xs text-muted-foreground">{currentIssue.archivedAt ? "Archived issue" : "Issue"} · Updated {currentIssue.updatedAt ? new Date(currentIssue.updatedAt).toLocaleString() : "just now"}</p></div>{role !== "viewer" && <Button variant="outline" size="sm" onClick={() => void toggleArchive()}>{currentIssue.archivedAt ? "Restore issue" : "Archive issue"}</Button>}</div>
        <form onSubmit={save} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex flex-col gap-5">
            <Card><CardContent className="flex flex-col gap-4 pt-4"><label className="flex flex-col gap-1.5 text-sm font-medium">Title<Input required maxLength={180} disabled={role === "viewer"} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="flex flex-col gap-1.5 text-sm font-medium">Description<Textarea maxLength={20000} disabled={role === "viewer"} className="min-h-36" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add details, context, or acceptance criteria" /></label></CardContent></Card>
            <Card><CardHeader><CardTitle>Comments</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
              {comments.length ? comments.map((item) => <article key={item.id} className="rounded-lg bg-muted/50 p-3"><div className="flex items-baseline justify-between gap-2"><span className="text-sm font-medium">{item.authorName || "Someone"}</span><time className="text-xs text-muted-foreground" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div><p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p>{item.mentions.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Mentioned {item.mentions.map((id) => members.find((member) => member.userId === id)?.name ?? "a teammate").join(", ")}</p>}</article>) : <p className="text-sm text-muted-foreground">No comments yet. Add context or ask a question.</p>}
              <form onSubmit={submitComment} className="flex flex-col gap-2"><Textarea aria-label="Write a comment" maxLength={10000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a comment…" /><div className="flex flex-wrap justify-between gap-2"><select aria-label="Mention teammates" multiple className="min-h-8 max-w-60 rounded-lg border bg-background px-2 text-sm" value={mentionIds} onChange={(event) => setMentionIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{members.map((member) => <option key={member.userId} value={member.userId}>Mention {member.name || member.email}</option>)}</select><Button size="sm" type="submit" disabled={!comment.trim()}><SendIcon aria-hidden="true" />Comment</Button></div></form>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Activity history</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">{activity.length ? activity.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 border-b pb-3 text-sm last:border-0"><span><strong className="font-medium">{entry.actorName || "Someone"}</strong> {entry.action.replace("issue.", "").replaceAll(".", " ")} {entry.changes.length ? `· ${entry.changes.join(", ")}` : ""}</span><time className="text-xs text-muted-foreground" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></div>) : <p className="text-sm text-muted-foreground">Activity will appear here as this issue changes.</p>}</CardContent></Card>
          </div>
          <div className="flex flex-col gap-5">
            <Card><CardHeader><CardTitle>Properties</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm">Status<select disabled={role === "viewer"} className="h-9 rounded-lg border bg-background px-2" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as IssueStatus })}>{STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
              <label className="flex flex-col gap-1.5 text-sm">Priority<select disabled={role === "viewer"} className="h-9 rounded-lg border bg-background px-2" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as IssuePriority })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
              <label className="flex flex-col gap-1.5 text-sm">Assignee<select disabled={role === "viewer" || role !== "owner"} className="h-9 rounded-lg border bg-background px-2" value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.name || member.email}</option>)}</select>{role !== "owner" && <span className="text-xs text-muted-foreground">Only a project owner can view the member roster.</span>}</label>
              <label className="flex flex-col gap-1.5 text-sm">Due date<Input type="date" disabled={role === "viewer"} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
              <label className="flex flex-col gap-1.5 text-sm">Estimate (points)<Input type="number" min="0" max="1000" step="0.5" disabled={role === "viewer"} value={form.estimate} onChange={(event) => setForm({ ...form, estimate: event.target.value })} placeholder="No estimate" /></label>
              <label className="flex flex-col gap-1.5 text-sm">Labels<Input disabled={role === "viewer"} value={form.labels} onChange={(event) => setForm({ ...form, labels: event.target.value })} placeholder="bug, frontend" /></label>
              <label className="flex flex-col gap-1.5 text-sm">Parent issue<select disabled={role === "viewer"} className="h-9 rounded-lg border bg-background px-2" value={form.parentIssueId} onChange={(event) => setForm({ ...form, parentIssueId: event.target.value })}><option value="">No parent</option>{projectIssues.filter((other) => other.id !== currentIssue.id).map((other) => <option key={other.id} value={other.id}>{other.title}</option>)}</select></label>
              <label className="flex flex-col gap-1.5 text-sm">Related issues<select multiple disabled={role === "viewer"} className="min-h-24 rounded-lg border bg-background p-2" value={form.relatedIssueIds.split(",").filter(Boolean)} onChange={(event) => setForm({ ...form, relatedIssueIds: Array.from(event.currentTarget.selectedOptions, (option) => option.value).join(",") })}>{projectIssues.filter((other) => other.id !== currentIssue.id).map((other) => <option key={other.id} value={other.id} className="rounded px-1 py-0.5">{other.title}</option>)}</select><span className="text-xs text-muted-foreground">Use Ctrl or Command to select more than one.</span></label>
              {role !== "viewer" && <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Attachments</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">{currentIssue.attachments.map((attachment, index) => <div key={`${attachment.url}-${index}`} className="flex items-center gap-2 text-sm"><PaperclipIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><a className="min-w-0 truncate underline underline-offset-4" href={attachment.url} target="_blank" rel="noreferrer">{attachment.name}</a>{role !== "viewer" && <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${attachment.name}`} onClick={() => { const next = currentIssue.attachments.filter((_, itemIndex) => itemIndex !== index); void updateIssue(currentIssue.id, { attachments: next }).then(({ issue: updated }) => { setIssue(updated); void load(); }).catch((reason: unknown) => toast.add({ type: "error", description: reason instanceof Error ? reason.message : "Could not remove attachment" })); }}>×</Button>}</div>)}
              {role !== "viewer" && <div className="flex flex-col gap-2 border-t pt-3"><Input aria-label="Attachment name" value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} placeholder="File name" /><Input aria-label="Attachment URL" type="url" value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="https://…" /><Button type="button" variant="outline" size="sm" onClick={() => void saveAttachment()} disabled={!attachmentName.trim() || !attachmentUrl.trim()}>Add link</Button><p className="text-xs text-muted-foreground">Attachments are links; file uploads are not enabled yet.</p></div>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Sub-issues</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">{projectIssues.filter((other) => other.parentIssueId === currentIssue.id).length ? projectIssues.filter((other) => other.parentIssueId === currentIssue.id).map((child) => <Link key={child.id} className="rounded-md border p-2 text-sm hover:bg-muted" href={`/dashboard/issues/${child.id}`}>{child.title}<span className="ml-2 text-xs text-muted-foreground">{label(child.status)}</span></Link>) : <p className="text-sm text-muted-foreground">No child issues linked.</p>}</CardContent></Card>
          </div>
        </form>
      </>}
    </div>
  </SidebarInset>;
}
