import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccountSummary } from "@/lib/account";
import { emailVerificationAvailable } from "@/lib/email";
import { assertSameOrigin, requireSessionUser, toErrorResponse } from "@/lib/session";

/**
 * Re-sends the verification email for the signed-in user's own address.
 *
 * The address is read from the session, never from the request body: allowing
 * the caller to name the address would turn this into an unauthenticated mail
 * relay, and better-auth's own `/send-verification-email` is deliberately
 * enumeration-safe for anonymous callers.
 */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    assertSameOrigin(request);

    if (!emailVerificationAvailable) {
      return NextResponse.json(
        {
          message:
            "Email delivery is not configured, so verification cannot be completed.",
        },
        { status: 409 },
      );
    }

    const account = await getAccountSummary();

    if (account.emailVerified) {
      return NextResponse.json(
        { message: "That address is already verified" },
        { status: 409 },
      );
    }

    await auth.api.sendVerificationEmail({
      body: { email: user.email },
    });

    // better-auth returns `{ status: true }` for unknown and already-verified
    // addresses alike, which is the right behaviour for a public endpoint. Here
    // the caller is already authenticated and was checked above, so a 200 means
    // a mail really was queued.
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
