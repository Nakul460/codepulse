import { NextResponse } from "next/server";
import { acceptInvitationForCaller } from "@/lib/invitations";
import {
  assertSameOrigin,
  requireSessionUser,
  toErrorResponse,
} from "@/lib/session";

type Context = RouteContext<"/api/invitations/[tokenOrId]/accept">;

/**
 * Accepts an invitation and creates the membership.
 *
 * Session-only, via `requireSessionUser`, which rejects a bearer PAT: a personal
 * access token is a durable credential that gets pasted into scripts and CI
 * logs, and it must not be able to turn an invitation into organization access.
 * The invitation proves the caller controls the mailbox; the session proves who
 * they are.
 *
 * `:tokenOrId` is either the token from the emailed link or the id from the
 * caller's own pending list on the dashboard. Both are resolved by
 * `acceptInvitationForCaller`, and both enforce that the invitation is addressed
 * to this session's address, so the dispatch cannot be used to skip that check.
 *
 * The email match lives in the lib rather than here so it cannot be bypassed by
 * reaching the same operation through the other entry point later.
 */
export async function POST(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    const { tokenOrId } = await ctx.params;

    const { organizationId, organizationName } = await acceptInvitationForCaller({
      tokenOrId,
      user,
    });

    return NextResponse.json({ ok: true, organizationId, organizationName });
  } catch (error) {
    console.error("accept organization invitation error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
