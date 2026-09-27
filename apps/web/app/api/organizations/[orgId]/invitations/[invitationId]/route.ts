import { NextResponse } from "next/server";
import { revokeInvitation } from "@/lib/invitations";
import { assertOrgPermission } from "@/lib/organizations";
import {
  assertSameOrigin,
  assertWriteScope,
  requireAuth,
  toErrorResponse,
} from "@/lib/session";

type Context = RouteContext<"/api/organizations/[orgId]/invitations/[invitationId]">;

/**
 * Revokes a pending invitation.
 *
 * `manage_members` rather than `invite_members`: revoking is not reversible
 * (the token is destroyed) and an admin who can invite can already supersede an
 * invite by re-inviting, so revocation is the more destructive of the two and
 * is gated accordingly.
 */
export async function DELETE(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const { orgId, invitationId } = await ctx.params;

    await assertOrgPermission(orgId, auth.user, "manage_members");

    await revokeInvitation({
      organizationId: orgId,
      invitationId,
      actor: auth.user,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("revoke organization invitation error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
