import { NextResponse } from "next/server";
import { declineInvitationForCaller } from "@/lib/invitations";
import {
  assertSameOrigin,
  requireSessionUser,
  toErrorResponse,
} from "@/lib/session";

type Context = RouteContext<"/api/invitations/[tokenOrId]/decline">;

/**
 * Declines an invitation.
 *
 * Same protections as accept: session-only, same-origin, and the same
 * addressed-to-me check. A decline is still a state change on a real
 * invitation, and without the address check a leaked link could be used to make
 * someone else's invitation look refused.
 */
export async function POST(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    const { tokenOrId } = await ctx.params;

    await declineInvitationForCaller({ tokenOrId, user });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("decline organization invitation error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
