import { NextResponse } from "next/server";
import { z } from "zod";
import { issueActivityModel, issueCommentModel, issueModel, organizationMemberModel, projectMemberModel } from "@/db/schema";
import { assertCanEdit } from "@/lib/projects";
import { getAuthorizedIssue, logIssueActivity, serializeIssue, serializeIssueComment } from "@/lib/issues";
import { assertSameOrigin, assertWriteScope, requireAuth, requireUser, toErrorResponse } from "@/lib/session";
import { updateIssueSchema } from "@/lib/validation";

type Context = RouteContext<"/api/issues/[issueId]">;

export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { issueId } = await ctx.params;
    const { issue, project } = await getAuthorizedIssue(issueId, user);
    const [comments, activity] = await Promise.all([
      issueCommentModel.find({ issueId }).sort({ createdAt: 1 }).lean(),
      issueActivityModel.find({ issueId }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    return NextResponse.json({
      issue: serializeIssue(issue as unknown as Record<string, unknown>),
      role: project.role,
      comments: await Promise.all(comments.map((entry) => serializeIssueComment(entry as unknown as Record<string, unknown>))),
      activity: activity.map((entry) => ({ id: String(entry._id), actorName: entry.actorName, action: entry.action, changes: entry.changes, metadata: entry.metadata, createdAt: entry.createdAt?.toISOString() })),
    });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function PATCH(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const { issueId } = await ctx.params;
    const { issue, project } = await getAuthorizedIssue(issueId, auth.user);
    await assertCanEdit(String(issue.projectId), auth.user);
    const parsed = updateIssueSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: "Invalid issue", issues: z.flattenError(parsed.error) }, { status: 422 });
    const changes = Object.keys(parsed.data).filter((key) => {
      if (key === "attachments") return JSON.stringify((issue.attachments ?? []).map((a: Record<string, unknown>) => ({ name: a.name, url: a.url, mimeType: a.mimeType, size: a.size }))) !== JSON.stringify(parsed.data.attachments ?? []);
      const current = (issue as Record<string, unknown>)[key];
      const next = (parsed.data as Record<string, unknown>)[key];
      if (key === "dueDate") return (current ? new Date(current as string | Date).toISOString().slice(0, 10) : null) !== (next || null);
      if (key === "parentIssueId") return (current ? String(current) : null) !== (next || null);
      if (key === "relatedIssueIds") return JSON.stringify(((current as unknown[]) ?? []).map(String).sort()) !== JSON.stringify(((next as string[]) ?? []).slice().sort());
      return JSON.stringify(current) !== JSON.stringify(next);
    });
    const value = parsed.data;
    if (value.assigneeId && !await organizationMemberModel.exists({ organizationId: project.organizationId, userId: value.assigneeId }) && !await projectMemberModel.exists({ projectId: issue.projectId, userId: value.assigneeId })) {
      return NextResponse.json({ message: "Assignee must be a member of this project" }, { status: 422 });
    }
    if (value.parentIssueId) {
      const parent = await issueModel.findOne({ _id: value.parentIssueId, projectId: issue.projectId, $and: [{ _id: { $ne: issue._id } }] }).select("_id parentIssueId").lean();
      if (!parent) return NextResponse.json({ message: "Parent issue must be another issue in this project" }, { status: 422 });
      const visited = new Set<string>();
      let ancestorId: unknown = parent._id;
      while (ancestorId) {
        const id = String(ancestorId);
        if (id === String(issue._id) || visited.has(id)) return NextResponse.json({ message: "Parent issue would create a hierarchy cycle" }, { status: 422 });
        visited.add(id);
        const ancestor = await issueModel.findOne({ _id: ancestorId, projectId: issue.projectId }).select("parentIssueId").lean();
        ancestorId = ancestor?.parentIssueId;
      }
    }
    if (value.relatedIssueIds?.length) {
      const count = await issueModel.countDocuments({ _id: { $in: value.relatedIssueIds, $ne: issue._id }, projectId: issue.projectId });
      if (count !== new Set(value.relatedIssueIds).size) return NextResponse.json({ message: "Related issues must be different issues in this project" }, { status: 422 });
    }
    const update = {
      ...value,
      ...(value.dueDate !== undefined ? { dueDate: value.dueDate ? new Date(value.dueDate) : null } : {}),
      ...(value.attachments ? { attachments: value.attachments.map((attachment) => ({ ...attachment, addedBy: auth.user.id, addedAt: new Date() })) } : {}),
      updatedBy: auth.user.id,
    };
    await issueModel.updateOne({ _id: issueId, projectId: issue.projectId }, { $set: update });
    const fresh = await issueModel.findById(issueId).lean();
    if (fresh && changes.length) await logIssueActivity({ issue: fresh, actor: auth.user, action: "issue.updated", changes });
    return NextResponse.json({ issue: fresh ? serializeIssue(fresh as unknown as Record<string, unknown>) : null });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const { issueId } = await ctx.params;
    const { issue } = await getAuthorizedIssue(issueId, auth.user);
    await assertCanEdit(String(issue.projectId), auth.user);
    const archivedAt = issue.archivedAt ? null : new Date();
    await issueModel.updateOne({ _id: issueId }, { $set: { archivedAt, updatedBy: auth.user.id } });
    await logIssueActivity({ issue, actor: auth.user, action: archivedAt ? "issue.archived" : "issue.restored", changes: ["archivedAt"] });
    return NextResponse.json({ ok: true, archivedAt: archivedAt?.toISOString() ?? null });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
