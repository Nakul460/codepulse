import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { findAccountDeletionBlockers } from "@/lib/account-deletion";
import { assertSameOrigin, requireSessionUser, toErrorResponse } from "@/lib/session";
import { z } from "zod";

/**
 * Account deletion: whether it is currently possible, and performing it.
 *
 * ## Why this is a proxy and not a call to `auth.api.deleteUser` from the client
 *
 * better-auth's `user.deleteUser.afterDelete` (wired in lib/auth.ts) removes
 * CodePulse-owned rows, and it only runs if better-auth actually deletes the
 * user. So the deletion has to go through `auth.api.deleteUser` on the server,
 * where `afterDelete` is guaranteed to fire, and the client must not be trusted
 * to have called it.
 *
 * ## Why the blockers are re-checked here and not only in the UI
 *
 * `findAccountDeletionBlockers` is the guard against leaving an organization
 * with no admin. The UI calls GET first to warn the user early, but that answer
 * is advisory and can be minutes stale — the authoritative check is the one
 * here, immediately before the delete.
 */

const deleteAccountSchema = z.object({
  // better-auth requires the password when the account has one, which is the
  // only thing stopping a walk-up attacker at an unlocked browser from
  // destroying the account. Optional, because an OAuth-only account has none.
  password: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireSessionUser();

    return NextResponse.json({
      blockers: await findAccountDeletionBlockers(user.id),
    });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    assertSameOrigin(request);

    const parsed = deleteAccountSchema.safeParse(await readJson(request));

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid request", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    const blockers = await findAccountDeletionBlockers(user.id);

    if (blockers.length > 0) {
      return NextResponse.json(
        {
          message:
            "Transfer or delete the organizations where you are the only admin first.",
          blockers,
        },
        { status: 409 },
      );
    }

    return await deleteUserAccount(parsed.data.password);
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * Runs the actual deletion, translating better-auth's expected failures into
 * statuses the account page can act on.
 *
 * better-auth's messages are safe to pass through: the password-mismatch and
 * stale-session cases say only what the caller already knows.
 */
async function deleteUserAccount(password: string | undefined) {
  try {
    await auth.api.deleteUser({
      headers: await headers(),
      body: password ? { password } : {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = apiErrorCode(error);

    if (code === "INVALID_PASSWORD") {
      return NextResponse.json(
        { message: "That password is not correct" },
        { status: 403 },
      );
    }

    if (code === "SESSION_EXPIRED") {
      return NextResponse.json(
        {
          message:
            "For your security, sign in again before deleting your account.",
        },
        { status: 401 },
      );
    }

    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * Reads better-auth's error code off a thrown endpoint error.
 *
 * better-call's `APIError` carries `{ status, body: { message, code } }`
 * (better-call/dist/error.mjs:100-114), and better-auth's own endpoints key
 * their branches on `code`, not on the message. `isAPIError` is better-auth's
 * predicate, so use it rather than re-deriving "is this one of ours" — and read
 * only `code`, never `message`, so no internal text is echoed back.
 */
function apiErrorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) {
    return undefined;
  }

  const code = error.body?.code;

  return typeof code === "string" ? code : undefined;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
