import { NextResponse } from "next/server";
import { revokeAccessToken } from "@/lib/access-tokens";
import {
  assertSameOrigin,
  requireSessionUser,
  toErrorResponse,
} from "@/lib/session";

/**
 * Revoke one of the caller's own tokens.
 *
 * A token id belonging to another account is reported as 404, not 403, matching
 * the rule used everywhere else: resource existence is not disclosed to
 * outsiders.
 *
 * Session-only, like the rest of the token management surface: a token must not
 * be able to revoke the credentials it is listed alongside.
 */
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/tokens/[tokenId]">,
) {
  try {
    const user = await requireSessionUser();
    assertSameOrigin(request);

    const { tokenId } = await ctx.params;

    const revoked = await revokeAccessToken(user.id, tokenId);

    if (!revoked) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
