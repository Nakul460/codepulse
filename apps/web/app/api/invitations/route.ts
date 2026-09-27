import { NextResponse } from "next/server";
import { listInvitationsForUser } from "@/lib/invitations";
import { requireUser, toErrorResponse } from "@/lib/session";

/**
 * Invitations addressed to the signed-in user, across every organization.
 *
 * Matched on email, not user id, so this works for someone who was invited
 * before they had an account. Drives the dashboard banner.
 *
 * `requireUser` (not `requireSessionUser`): a personal access token may read
 * this. It exposes nothing a token client could not already see about itself,
 * unlike the routes that mutate credentials.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);

    return NextResponse.json({
      invitations: await listInvitationsForUser(user),
    });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
