import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInvitationEmail } from "@/lib/email";
import { createInvitation, listInvitations } from "@/lib/invitations";
import { assertOrgPermission } from "@/lib/organizations";
import {
  assertSameOrigin,
  assertWriteScope,
  requireAuth,
  requireUser,
  toErrorResponse,
} from "@/lib/session";
import { createInvitationSchema } from "@/lib/validation";

type Context = RouteContext<"/api/organizations/[orgId]/invitations">;

/**
 * Pending invitations for an organization.
 *
 * Gated on `view_members` rather than `manage_members`, so it stays readable if
 * roster visibility is ever widened without also granting member management.
 */
export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { orgId } = await ctx.params;

    await assertOrgPermission(orgId, user, "view_members");

    return NextResponse.json({ invitations: await listInvitations(orgId) });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * Invites someone. `invite_members` is the permission, not `manage_members`:
 * sending an invite grants nothing on its own — the membership only exists once
 * the recipient accepts — so it is the weaker and more appropriate gate.
 */
export async function POST(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const { orgId } = await ctx.params;

    await assertOrgPermission(orgId, user, "invite_members");

    const parsed = createInvitationSchema.safeParse(await readJson(request));

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid invitation", issues: z.flattenError(parsed.error) },
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

    const { invitation, token } = await createInvitation({
      organizationId: orgId,
      email,
      role: parsed.data.role,
      invitedBy: user,
    });

    // The invitation is recorded whether or not the mail sends, so the admin
    // sees it in the pending list and can re-send. Failing the request instead
    // would leave a row the admin cannot see — the worst of both.
    await sendInvitationEmail({
      to: email,
      inviterName: user.name || user.email,
      organizationName: invitation.organizationName,
      token,
      expiresAt: new Date(invitation.expiresAt),
    });

    // The token is deliberately not in this response. The admin cannot
    // re-obtain it; only a re-send mints a new one.
    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    console.error("create organization invitation error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
