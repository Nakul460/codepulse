import { NextResponse } from "next/server";
import { z } from "zod";
import { projectModel, projectActivityModel, projectMemberModel } from "@/db/schema";
import { connectProjectDB } from "@/db/db";
import {
  assertCanDelete,
  assertCanEdit,
  getProject,
  logActivity,
} from "@/lib/projects";
import { requireUser, toErrorResponse, assertSameOrigin } from "@/lib/session";
import { updateProjectSchema } from "@/lib/validation";

type Context = RouteContext<"/api/projects/[projectId]">;

export async function GET(_request: Request, ctx: Context) {
  try {
    const user = await requireUser();
    const { projectId } = await ctx.params;
    const project = await getProject(projectId, user);

    return NextResponse.json({ project });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

const TRACKED_FIELDS = [
  "projectName",
  "description",
  "status",
  "startDate",
  "endDate",
  "budget",
] as const;

export async function PATCH(request: Request, ctx: Context) {
    try {
    assertSameOrigin(request);
      const user = await requireUser();
    const { projectId } = await ctx.params;

    // The assert returns the authorized project, so its organizationId can be
    // used to scope the reads and writes below. Scoping the filter as well as
    // the ordering means a future refactor cannot silently turn this into a
    // cross-tenant write.
    const authorized = await assertCanEdit(projectId, user);
    const { organizationId } = authorized;

    const parsed = updateProjectSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid project", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    await connectProjectDB();

    const before = await projectModel
      .findOne({ _id: projectId, organizationId })
      .lean();

    if (!before) {
      return NextResponse.json({ message: "Project not found" }, { status: 404 });
    }

    // Validate the merged result, since a patch usually carries only one date.
    const mergedStart =
      "startDate" in parsed.data ? parsed.data.startDate : before.startDate;
    const mergedEnd = "endDate" in parsed.data ? parsed.data.endDate : before.endDate;

    if (
      mergedStart &&
      mergedEnd &&
      new Date(mergedEnd as string).getTime() < new Date(mergedStart as string).getTime()
    ) {
      return NextResponse.json(
        { message: "End date must be on or after the start date" },
        { status: 422 },
      );
    }

    const changed = TRACKED_FIELDS.filter((field) => {
      if (!(field in parsed.data)) {
        return false;
      }

      const next = (parsed.data as Record<string, unknown>)[field];
      const current = (before as unknown as Record<string, unknown>)[field];

      if (next === null || current === null) {
        return next !== current;
      }

      const nextTime = new Date(next as string).getTime();
      const currentTime = new Date(current as string).getTime();

      if (!isNaN(nextTime) && !isNaN(currentTime)) {
        return nextTime !== currentTime;
      }

      return next !== current;
    });

    if (changed.length === 0) {
      const current = await getProject(projectId, user);
      return NextResponse.json({ project: current });
    }

    await projectModel.updateOne(
      { _id: projectId, organizationId },
      { $set: parsed.data },
    );

    await logActivity({
      projectId,
      actor: user,
      action: "project.updated",
      changes: changed,
    });

    const project = await getProject(projectId, user);

    return NextResponse.json({ project });
  } catch (error) {
    console.error("update project error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: Request, ctx: Context) {
    try {
    assertSameOrigin(request);
      const user = await requireUser();
    const { projectId } = await ctx.params;

    const { organizationId } = await assertCanDelete(projectId, user);
    await connectProjectDB();

    const project = await projectModel
      .findOneAndDelete({ _id: projectId, organizationId })
      .lean();

    if (!project) {
      return NextResponse.json({ message: "Project not found" }, { status: 404 });
    }

    // The project is gone, so its feed goes with it: members and activity are
    // removed rather than left orphaned against a missing project.
    await Promise.all([
      projectMemberModel.deleteMany({ projectId }),
      projectActivityModel.deleteMany({ projectId }),
    ]);

    return NextResponse.json({ message: "Project deleted" });
  } catch (error) {
    console.error("delete project error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
