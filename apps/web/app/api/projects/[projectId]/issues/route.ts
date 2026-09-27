import { NextResponse } from "next/server";
import { z } from "zod";
import { issueModel, organizationMemberModel, projectMemberModel } from "@/db/schema";
import { connectProjectDB } from "@/db/db";
import { assertCanEdit, getProject } from "@/lib/projects";
import { logIssueActivity, serializeIssue } from "@/lib/issues";
import { assertSameOrigin, assertWriteScope, requireAuth, requireUser, toErrorResponse } from "@/lib/session";
import { createIssueSchema } from "@/lib/validation";

type Context = RouteContext<"/api/projects/[projectId]/issues">;

export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { projectId } = await ctx.params;
    await getProject(projectId, user);
    await connectProjectDB();
    const archived = new URL(request.url).searchParams.get("archived") === "true";
    const docs = await issueModel.find({ projectId, ...(archived ? {} : { archivedAt: null }) }).sort({ updatedAt: -1 }).lean();
    return NextResponse.json({ issues: docs.map((doc) => serializeIssue(doc as unknown as Record<string, unknown>)) });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const { projectId } = await ctx.params;
    const project = await assertCanEdit(projectId, auth.user);
    const parsed = createIssueSchema.safeParse({ ...(await request.json()), projectId });
    if (!parsed.success) return NextResponse.json({ message: "Invalid issue", issues: z.flattenError(parsed.error) }, { status: 422 });
    const value = parsed.data;
    await connectProjectDB();
    if (value.assigneeId && !await organizationMemberModel.exists({ organizationId: project.organizationId, userId: value.assigneeId }) && !await projectMemberModel.exists({ projectId, userId: value.assigneeId })) {
      return NextResponse.json({ message: "Assignee must be a member of this project" }, { status: 422 });
    }
    if (value.parentIssueId) {
      const parent = await issueModel.findOne({ _id: value.parentIssueId, projectId }).select("_id").lean();
      if (!parent) return NextResponse.json({ message: "Parent issue must belong to this project" }, { status: 422 });
    }
    if (value.relatedIssueIds.length) {
      const count = await issueModel.countDocuments({ _id: { $in: value.relatedIssueIds }, projectId });
      if (count !== new Set(value.relatedIssueIds).size) return NextResponse.json({ message: "Related issues must belong to this project" }, { status: 422 });
    }
    const issue = await issueModel.create({
      ...value,
      organizationId: project.organizationId,
      dueDate: value.dueDate ? new Date(value.dueDate) : null,
      createdBy: auth.user.id,
      updatedBy: auth.user.id,
      attachments: value.attachments.map((attachment) => ({ ...attachment, addedBy: auth.user.id, addedAt: new Date() })),
    });
    await logIssueActivity({ issue, actor: auth.user, action: "issue.created", changes: ["title"] });
    const serialized = serializeIssue(issue.toObject() as unknown as Record<string, unknown>);
    return NextResponse.json({ issue: serialized }, { status: 201 });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
