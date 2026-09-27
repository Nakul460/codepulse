import { NextResponse } from "next/server";
import { revokeDeviceSessionById } from "@/lib/account";
import {
  assertSameOrigin,
  requireSessionUser,
  toErrorResponse,
} from "@/lib/session";

/**
 * Revoke one device session.
 *
 * Takes the session *document id*, never the session token: better-auth's
 * `revokeSession` needs the token, and shipping tokens to the browser would
 * hand out a credential for every logged-in device. `revokeDeviceSessionById`
 * resolves the id back to its token server-side after checking ownership, so an
 * id belonging to someone else is simply not found.
 */
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/account/sessions/[sessionId]">,
) {
  try {
    await requireSessionUser();
    assertSameOrigin(request);

    const { sessionId } = await ctx.params;

    if (!sessionId || sessionId.length > 64) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    await revokeDeviceSessionById(sessionId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
