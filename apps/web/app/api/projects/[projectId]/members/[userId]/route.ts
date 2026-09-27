import { NextResponse } from "next/server";
import { z } from "zod";
import { projectMemberModel } from "@/db/schema";
import { connectProjectDB } from "@/db/db";
import {
  assertCanManageMembers,
  listMembers,
  logActivity,
} from "@/lib/projects";
import {
  ForbiddenError,
  NotFoundError,
  assertSameOrigin,
  assertWriteScope,
  requireAuth,
  toErrorResponse,
} from "@/lib/session";
import { updateMemberSchema } from "@/lib/validation";

type Context = RouteContext<"/api/projects/[projectId]/members/[userId]">;

export async function PATCH(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const { projectId, userId } = await ctx.params;

    await assertCanManageMembers(projectId, user);

    const parsed = updateMemberSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid role", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    await connectProjectDB();

    const member = await projectMemberModel
      .findOne({ projectId, userId })
      .lean();

    if (!member) {
      throw new NotFoundError("Member not found");
    }

    if (member.role === "owner") {
      throw new ForbiddenError("The project owner's role cannot be changed");
    }

    await projectMemberModel.updateOne(
      { projectId, userId },
      { $set: { role: parsed.data.role } },
    );

    await logActivity({
      projectId,
      actor: user,
      action: "member.role_changed",
      changes: [member.email],
      metadata: { from: member.role, to: parsed.data.role },
    });

    return NextResponse.json({ members: await listMembers(projectId) });
  } catch (error) {
    console.error("update member error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const { projectId, userId } = await ctx.params;

    await assertCanManageMembers(projectId, user);

    await connectProjectDB();

    const member = await projectMemberModel
      .findOne({ projectId, userId })
      .lean();

    if (!member) {
      throw new NotFoundError("Member not found");
    }

    if (member.role === "owner") {
      throw new ForbiddenError("The project owner cannot be removed");
    }

    await projectMemberModel.deleteOne({ projectId, userId });

    await logActivity({
      projectId,
      actor: user,
      action: "member.removed",
      changes: [member.email],
    });

    return NextResponse.json({ members: await listMembers(projectId) });
  } catch (error) {
    console.error("remove member error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
