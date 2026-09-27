import { NextResponse } from "next/server";
import { previewInvitation } from "@/lib/invitations";
import { toErrorResponse } from "@/lib/session";

type Context = RouteContext<"/api/invitations/[tokenOrId]">;

/**
 * Preview of an invitation, for the landing page.
 *
 * Unauthenticated on purpose, and it deliberately reveals **only** what the
 * email itself already told the recipient: the organization name, the role
 * offered, and who invited them. It does not report the organization id or any
 * other data, so a token forwarded to someone outside the company leaks no more
 * than the forwarded email already did.
 *
 * Gating this behind a session would break the flow it exists for: a recipient
 * who followed the link while signed out has to be able to see what they were
 * invited to *before* being sent to sign in, otherwise the page can only say
 * "invalid" and never "sign in as the address this went to". Nothing here
 * grants access — acceptance is a separate, session-gated `POST`.
 */
export async function GET(_request: Request, ctx: Context) {
  try {
    const { tokenOrId } = await ctx.params;

    return NextResponse.json({
      invitation: await previewInvitation(tokenOrId),
    });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
