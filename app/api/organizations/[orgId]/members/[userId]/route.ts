import { NextResponse } from "next/server";
import { z } from "zod";
import { connectProjectDB } from "@/db/db";
import { organizationMemberModel } from "@/db/schema";
import {
  assertOrgAdmin,
  countOrgAdmins,
  listOrgMembers,
  logOrgActivity,
} from "@/lib/organizations";
import {
  ForbiddenError,
  NotFoundError,
  assertSameOrigin,
  requireUser,
  toErrorResponse,
} from "@/lib/session";
import { updateOrgMemberSchema } from "@/lib/validation";

type Context = RouteContext<"/api/organizations/[orgId]/members/[userId]">;

export async function PATCH(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const admin = await requireUser();
    const { orgId, userId } = await ctx.params;

    await assertOrgAdmin(orgId, admin);

    const parsed = updateOrgMemberSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid role", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    await connectProjectDB();

    const member = await organizationMemberModel
      .findOne({ organizationId: orgId, userId })
      .lean();

    if (!member) {
      throw new NotFoundError("Member not found");
    }

    // An org must always keep at least one admin, otherwise nobody could
    // ever manage it again.
    if (member.role === "admin" && parsed.data.role !== "admin") {
      const admins = await countOrgAdmins(orgId);

      if (admins <= 1) {
        throw new ForbiddenError(
          "An organization must have at least one admin",
        );
      }
    }

    await organizationMemberModel.updateOne(
      { organizationId: orgId, userId },
      { $set: { role: parsed.data.role } },
    );

    await logOrgActivity({
      organizationId: orgId,
      actor: admin,
      action: "org.role_changed",
      target: member.email,
      metadata: { from: member.role, to: parsed.data.role },
    });

    return NextResponse.json({ members: await listOrgMembers(orgId) });
  } catch (error) {
    console.error("update organization member error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const admin = await requireUser();
    const { orgId, userId } = await ctx.params;

    await assertOrgAdmin(orgId, admin);

    if (userId === admin.id) {
      return NextResponse.json(
        { message: "You cannot remove yourself from the organization" },
        { status: 409 },
      );
    }

    await connectProjectDB();

    const member = await organizationMemberModel
      .findOne({ organizationId: orgId, userId })
      .lean();

    if (!member) {
      throw new NotFoundError("Member not found");
    }

    if (member.role === "admin") {
      const admins = await countOrgAdmins(orgId);

      if (admins <= 1) {
        throw new ForbiddenError(
          "An organization must have at least one admin",
        );
      }
    }

    await organizationMemberModel.deleteOne({ organizationId: orgId, userId });

    await logOrgActivity({
      organizationId: orgId,
      actor: admin,
      action: "org.member_removed",
      target: member.email,
      metadata: { role: member.role },
    });

    return NextResponse.json({ members: await listOrgMembers(orgId) });
  } catch (error) {
    console.error("remove organization member error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
