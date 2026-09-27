import { NextResponse } from "next/server";
import {
  listDeviceSessions,
  revokeOtherDeviceSessions,
} from "@/lib/account";
import { assertSameOrigin, requireSessionUser, toErrorResponse } from "@/lib/session";

/**
 * The caller's logged-in devices.
 *
 * better-auth gates `listSessions` and `revokeOtherSessions` on
 * `session.freshAge`, so a session that has not re-authenticated recently gets
 * a 403 and the caller must sign in again. That is deliberate: enumerating
 * every logged-in device and mass-revoking are reauth-worthy actions, and this
 * route deliberately does not try to work around it.
 */
export async function GET() {
  try {
    await requireSessionUser();

    return NextResponse.json({ sessions: await listDeviceSessions() });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

/** Signs out every other device, keeping the current one. */
export async function POST(request: Request) {
  try {
    await requireSessionUser();
    assertSameOrigin(request);

    await revokeOtherDeviceSessions();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
