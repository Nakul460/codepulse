import { NextResponse } from "next/server";
import { z } from "zod";
import { connectProjectDB } from "@/db/db";
import { organizationMemberModel } from "@/db/schema";
import { emailVerificationAvailable } from "@/lib/email";
import { findUserByEmail } from "@/lib/mongo";
import {
  assertOrgAdmin,
  listOrgMembers,
  logOrgActivity,
} from "@/lib/organizations";
import { requireUser, toErrorResponse, assertSameOrigin } from "@/lib/session";
import { addOrgMemberSchema } from "@/lib/validation";

type Context = RouteContext<"/api/organizations/[orgId]/members">;

export async function GET(_request: Request, ctx: Context) {
  try {
    const user = await requireUser();
    const { orgId } = await ctx.params;

    await assertOrgAdmin(orgId, user);

    return NextResponse.json({ members: await listOrgMembers(orgId) });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request, ctx: Context) {
    try {
    assertSameOrigin(request);
      const user = await requireUser();
    const { orgId } = await ctx.params;

    await assertOrgAdmin(orgId, user);

    const parsed = addOrgMemberSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid member", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    const email = parsed.data.email.toLowerCase();

    if (email === user.email.toLowerCase()) {
      return NextResponse.json(
        { message: "You are already a member of this organization" },
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

    // The membership is keyed to invitee.id, so an unverified account means
    // whoever controls that mailbox's password owns the membership. Refuse it
    // rather than silently granting access to whoever registered the address.
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

    const existing = await organizationMemberModel
      .findOne({ organizationId: orgId, userId: invitee.id })
      .lean();

    if (existing) {
      return NextResponse.json(
        { message: "That person is already a member" },
        { status: 409 },
      );
    }

    await organizationMemberModel.create({
      organizationId: orgId,
      userId: invitee.id,
      email,
      name: invitee.name ?? "",
      role: "member",
    });

    await logOrgActivity({
      organizationId: orgId,
      actor: user,
      action: "org.member_added",
      target: email,
    });

    return NextResponse.json(
      { members: await listOrgMembers(orgId) },
      { status: 201 },
    );
  } catch (error) {
    console.error("add organization member error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
