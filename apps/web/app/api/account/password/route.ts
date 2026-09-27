import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assertSameOrigin, requireSessionUser, toErrorResponse } from "@/lib/session";
import { changePasswordSchema } from "@/lib/validation";

/**
 * Changes the signed-in user's password.
 *
 * The new password is re-validated by better-auth's `password.hash` funnel
 * (lib/auth.ts), which is where the policy is actually enforced, so this route
 * is a proxy rather than the place the rules live.
 */
export async function POST(request: Request) {
  try {
    await requireSessionUser();
    assertSameOrigin(request);

    const parsed = changePasswordSchema.safeParse(await readJson(request));

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid request", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    if (parsed.data.currentPassword) {
      await auth.api.changePassword({
        headers: await headers(),
        body: {
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
          // Defaults to true: leaving the other sessions alive after a password
          // change is how a stolen cookie outlives the compromise.
          revokeOtherSessions: parsed.data.revokeOtherSessions,
        },
      });
    } else {
      // No `currentPassword`, so this must be an OAuth-only account setting its
      // *first* password. `setPassword` is the right endpoint here, and it
      // enforces that itself: it returns `{ status: false }` when a credential
      // account already exists, which is better-auth refusing to let this branch
      // become a way to overwrite a password without proving you know the old
      // one. Relying on that check is what makes the optional field safe.
      const { status } = await auth.api.setPassword({
        headers: await headers(),
        body: { newPassword: parsed.data.newPassword },
      });

      if (!status) {
        return NextResponse.json(
          { message: "Enter your current password to change it." },
          { status: 422 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
