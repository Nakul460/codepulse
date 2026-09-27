import { NextResponse } from "next/server";
import { z } from "zod";
import { issueCommentModel } from "@/db/schema";
import { getAuthorizedIssue, canMentionInProject, logIssueActivity, serializeIssueComment } from "@/lib/issues";
import { assertSameOrigin, assertWriteScope, requireAuth, requireUser, toErrorResponse } from "@/lib/session";
import { createIssueCommentSchema } from "@/lib/validation";

type Context = RouteContext<"/api/issues/[issueId]/comments">;

export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { issueId } = await ctx.params;
    await getAuthorizedIssue(issueId, user);
    const comments = await issueCommentModel.find({ issueId }).sort({ createdAt: 1 }).lean();
    return NextResponse.json({ comments: await Promise.all(comments.map((c) => serializeIssueComment(c as unknown as Record<string, unknown>))) });
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
    const { issueId } = await ctx.params;
    const { issue } = await getAuthorizedIssue(issueId, auth.user);
    const parsed = createIssueCommentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: "Invalid comment", issues: z.flattenError(parsed.error) }, { status: 422 });
    const mentions = [...new Set(parsed.data.mentions)];
    for (const mentionedId of mentions) {
      if (!await canMentionInProject(String(issue.projectId), auth.user.id, mentionedId)) return NextResponse.json({ message: "Mentions must refer to another project member" }, { status: 422 });
    }
    const comment = await issueCommentModel.create({ issueId, organizationId: issue.organizationId, authorId: auth.user.id, authorName: auth.user.name || auth.user.email, body: parsed.data.body, mentions });
    await logIssueActivity({ issue, actor: auth.user, action: "issue.commented", changes: ["comments"], metadata: { commentId: String(comment._id), mentions } });
    return NextResponse.json({ comment: await serializeIssueComment(comment.toObject() as unknown as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
