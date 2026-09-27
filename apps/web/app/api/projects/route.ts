import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { projectModel, projectMemberModel } from "@/db/schema";
import { connectProjectDB } from "@/db/db";
import { listProjects, logActivity, serializeProject } from "@/lib/projects";
import { getOrgRole } from "@/lib/organizations";
import {
  assertSameOrigin,
  assertWriteScope,
  requireAuth,
  requireUser,
  toErrorResponse,
} from "@/lib/session";
import { createProjectSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const params = request.nextUrl.searchParams;
    const archived = params.get("archived") === "true";
    const organizationId = params.get("orgId") ?? undefined;

    const projects = await listProjects(user, { archived, organizationId });

    return NextResponse.json({ projects });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const parsed = createProjectSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid project", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    const { organizationId, ...fields } = parsed.data;

    // Only org members may create projects inside that org.
    const role = await getOrgRole(organizationId, user.id);

    if (!role) {
      return NextResponse.json(
        { message: "You are not a member of that organization" },
        { status: 403 },
      );
    }

    await connectProjectDB();

    const project = await projectModel.create({
      organizationId,
      ...fields,
    });

    // The creator is recorded as a project owner so they keep delete rights
    // even if they later lose org admin.
    await projectMemberModel.create({
      projectId: project._id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: "owner",
    });

    await logActivity({
      projectId: String(project._id),
      organizationId,
      actor: user,
      action: "project.created",
    });

    const serialized = serializeProject(
      project.toObject() as unknown as Record<string, unknown>,
      "owner",
    );

    return NextResponse.json({ project: serialized }, { status: 201 });
  } catch (error) {
    console.error("create project error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
