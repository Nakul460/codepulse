import { NextResponse } from "next/server";
import { z } from "zod";
import { projectMemberModel } from "@/db/schema";
import { connectProjectDB } from "@/db/db";
import { emailVerificationAvailable } from "@/lib/email";
import { findUserByEmail } from "@/lib/mongo";
import {
  assertCanManageMembers,
  listMembers,
  logActivity,
} from "@/lib/projects";
import { requireUser, toErrorResponse, assertSameOrigin } from "@/lib/session";
import { addMemberSchema } from "@/lib/validation";

type Context = RouteContext<"/api/projects/[projectId]/members">;

export async function GET(_request: Request, ctx: Context) {
  try {
    const user = await requireUser();
    const { projectId } = await ctx.params;

    // The roster exposes every collaborator's email address, so it is limited
    // to owners. The activity feed stays open to any member.
    await assertCanManageMembers(projectId, user);

    return NextResponse.json({ members: await listMembers(projectId) });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request, ctx: Context) {
    try {
    assertSameOrigin(request);
      const user = await requireUser();
    const { projectId } = await ctx.params;

    await assertCanManageMembers(projectId, user);

    const parsed = addMemberSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid member", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    const email = parsed.data.email.toLowerCase();

    if (email === user.email.toLowerCase()) {
      return NextResponse.json(
        { message: "You are already the owner of this project" },
        { status: 409 },
      );
    }

    const invitee = await findUserByEmail(email);

    if (!invitee) {
      return NextResponse.json(
        { message: "No account found for that email address" },
        { status: 404 },
      );
    }

    // Membership is keyed to invitee.id, so an unverified address would hand
    // access to whoever registered it, not to the real mailbox owner.
    if (emailVerificationAvailable && !invitee.emailVerified) {
      return NextResponse.json(
        {
          message:
            "That account has not verified its email address yet. Ask them to verify it, then add them again.",
        },
        { status: 409 },
      );
    }

    await connectProjectDB();

    const existing = await projectMemberModel
      .findOne({ projectId, userId: invitee.id })
      .lean();

    if (existing) {
      return NextResponse.json(
        { message: "That person is already a member" },
        { status: 409 },
      );
    }

    await projectMemberModel.create({
      projectId,
      userId: invitee.id,
      email,
      name: invitee.name ?? "",
      role: parsed.data.role,
    });

    await logActivity({
      projectId,
      actor: user,
      action: "member.added",
      changes: [email],
      metadata: { role: parsed.data.role },
    });

    return NextResponse.json(
      { members: await listMembers(projectId) },
      { status: 201 },
    );
  } catch (error) {
    console.error("add member error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
