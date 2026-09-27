import { Types } from "mongoose";
import { connectProjectDB } from "@/db/db";
import { issueActivityModel, issueCommentModel, issueModel, organizationMemberModel, projectMemberModel, projectModel } from "@/db/schema";
import { NotFoundError, type SessionUser } from "@/lib/session";
import { getProject } from "@/lib/projects";

export function serializeIssue(doc: Record<string, unknown>) {
  const iso = (value: unknown) => value ? new Date(value as string | Date).toISOString() : null;
  return {
    id: String(doc._id), projectId: String(doc.projectId), organizationId: String(doc.organizationId),
    title: String(doc.title), description: String(doc.description ?? ""), status: String(doc.status),
    priority: String(doc.priority), labels: (doc.labels as string[]) ?? [], assigneeId: doc.assigneeId ? String(doc.assigneeId) : null,
    dueDate: iso(doc.dueDate), estimate: doc.estimate == null ? null : Number(doc.estimate),
    parentIssueId: doc.parentIssueId ? String(doc.parentIssueId) : null,
    relatedIssueIds: ((doc.relatedIssueIds as unknown[]) ?? []).map(String),
    attachments: ((doc.attachments as Array<Record<string, unknown>>) ?? []).map((a) => ({ name: String(a.name), url: String(a.url), mimeType: String(a.mimeType ?? ""), size: Number(a.size ?? 0), addedAt: iso(a.addedAt) })),
    archivedAt: iso(doc.archivedAt), createdBy: String(doc.createdBy), updatedBy: String(doc.updatedBy),
    createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
  };
}

export async function getAuthorizedIssue(issueId: string, user: SessionUser) {
  await connectProjectDB();
  if (!Types.ObjectId.isValid(issueId)) throw new NotFoundError("Issue not found");
  const issue = await issueModel.findById(issueId).lean();
  if (!issue) throw new NotFoundError("Issue not found");
  const project = await getProject(String(issue.projectId), user);
  return { issue, project };
}

export async function listIssues(projectId: string, user: SessionUser, includeArchived = false) {
  await getProject(projectId, user);
  const docs = await issueModel.find({ projectId, ...(includeArchived ? {} : { archivedAt: null }) }).sort({ updatedAt: -1 }).lean();
  return docs.map((doc) => serializeIssue(doc as unknown as Record<string, unknown>));
}

export async function logIssueActivity(input: { issue: { _id: unknown; organizationId: unknown }; actor: SessionUser; action: string; changes?: string[]; metadata?: Record<string, unknown> | null }) {
  await issueActivityModel.create({ issueId: input.issue._id, organizationId: input.issue.organizationId, actorId: input.actor.id, actorName: input.actor.name || input.actor.email, action: input.action, changes: input.changes ?? [], metadata: input.metadata ?? null });
}

export async function serializeIssueComment(doc: Record<string, unknown>) {
  return { id: String(doc._id), authorId: String(doc.authorId), authorName: String(doc.authorName ?? ""), body: String(doc.body), mentions: (doc.mentions as string[]) ?? [], createdAt: new Date(doc.createdAt as string | Date).toISOString() };
}

export async function canMentionInProject(projectId: string, userId: string, mentionedId: string) {
  const project = await getAuthorizedProjectDoc(projectId);
  if (!project) return false;
  const [orgMember, projectMember] = await Promise.all([
    organizationMemberModel.exists({ organizationId: project.organizationId, userId: mentionedId }),
    projectMemberModel.exists({ projectId, userId: mentionedId }),
  ]);
  return (orgMember || projectMember) && mentionedId !== userId;
}

async function getAuthorizedProjectDoc(projectId: string) {
  await connectProjectDB();
  return projectModel.findById(projectId).select("organizationId").lean();
}

export { issueActivityModel, issueCommentModel, issueModel };
