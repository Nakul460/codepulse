import { NextResponse } from "next/server";
import { projectModel } from "@/db/schema";
import { connectProjectDB } from "@/db/db";
import { assertCanEdit, getProject, logActivity } from "@/lib/projects";
import {
  assertSameOrigin,
  assertWriteScope,
  requireAuth,
  toErrorResponse,
} from "@/lib/session";

type Context = RouteContext<"/api/projects/[projectId]/archive">;

/** Archive a project. Soft delete: sets archivedAt, hides it from the default list. */
export async function POST(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const { projectId } = await ctx.params;

    const existing = await assertCanEdit(projectId, user);

    if (existing.archivedAt) {
      return NextResponse.json({ project: existing });
    }

    await connectProjectDB();

    await projectModel.updateOne(
      { _id: projectId, organizationId: existing.organizationId },
      { $set: { archivedAt: new Date(), archivedBy: user.id } },
    );

    await logActivity({
      projectId,
      actor: user,
      action: "project.archived",
    });

    return NextResponse.json({ project: await getProject(projectId, user) });
  } catch (error) {
    console.error("archive project error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

/** Restore a previously archived project. */
export async function DELETE(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const { projectId } = await ctx.params;

    const existing = await assertCanEdit(projectId, user);

    if (!existing.archivedAt) {
      return NextResponse.json({ project: existing });
    }

    await connectProjectDB();

    await projectModel.updateOne(
      { _id: projectId, organizationId: existing.organizationId },
      { $set: { archivedAt: null, archivedBy: null } },
    );

    await logActivity({
      projectId,
      actor: user,
      action: "project.restored",
    });

    return NextResponse.json({ project: await getProject(projectId, user) });
  } catch (error) {
    console.error("restore project error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
