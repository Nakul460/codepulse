import { NextResponse } from "next/server";
import { z } from "zod";
import { createAccessToken, listAccessTokens } from "@/lib/access-tokens";
import {
  assertSameOrigin,
  requireSessionUser,
  toErrorResponse,
} from "@/lib/session";
import { createAccessTokenSchema } from "@/lib/validation";

/**
 * Personal access tokens for the *caller's own* account.
 *
 * These routes are always session-authenticated, even though the tokens they
 * mint work everywhere: minting a credential is something a human does in a
 * browser, and a token able to mint more tokens is a lateral-movement problem.
 * A caller presenting a token here is rejected by `requireSessionUser`, which
 * reads the cookie and never consults the `Authorization` header.
 */

export async function GET() {
  try {
    const user = await requireSessionUser();

    return NextResponse.json({ tokens: await listAccessTokens(user.id) });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    assertSameOrigin(request);

    const parsed = createAccessTokenSchema.safeParse(await readJson(request));

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid request", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    const { record, secret } = await createAccessToken({
      userId: user.id,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      expiresInDays: parsed.data.expiresInDays,
    });

    // The only response that ever contains the token. It is not logged, not
    // stored, and cannot be recovered — the database holds only its hash.
    return NextResponse.json(
      {
        token: record,
        secret,
        warning:
          "Copy this token now. It cannot be shown again, and CodePulse " +
          "cannot recover it for you.",
      },
      { status: 201 },
    );
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * Reads a JSON body without throwing on empty or malformed input, so a bad
 * request becomes a 422 from the schema rather than a 500 from `JSON.parse`.
 */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
