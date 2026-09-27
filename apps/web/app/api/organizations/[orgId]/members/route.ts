import { NextResponse } from "next/server";
import { assertOrgPermission, listOrgMembers } from "@/lib/organizations";
import { requireUser, toErrorResponse } from "@/lib/session";

type Context = RouteContext<"/api/organizations/[orgId]/members">;

/**
 * `GET` only — this route deliberately has **no** `POST`.
 *
 * Members used to be added straight from this route, which wrote the membership
 * as soon as an admin typed an email address. That handed organization access to
 * whoever had registered that address, and the only guard (`emailVerified`) was
 * itself skipped whenever no mail sender was configured. Adding is now
 * `POST /api/organizations/[orgId]/invitations`, and the membership is written
 * only after the recipient proves they control the mailbox by accepting a token
 * that was emailed to it.
 */

export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { orgId } = await ctx.params;

    await assertOrgPermission(orgId, user, "view_members");

    return NextResponse.json({ members: await listOrgMembers(orgId) });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
