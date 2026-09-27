import { NextResponse } from "next/server";
import { z } from "zod";
import { getInstallationUrl, signInstallState } from "@/lib/github";
import { assertOrgAdmin } from "@/lib/organizations";
import {
  requireUser,
  toErrorResponse,
} from "@/lib/session";
import { startInstallSchema } from "@/lib/validation";

/**
 * Starts the GitHub App install flow by redirecting to GitHub.
 *
 * No `assertSameOrigin` here on purpose: this is a top-level navigation the
 * user initiates, and the redirect target is github.com. The org admin check
 * plus a signed `state` is what protects it — the state is verified on the way
 * back in `callback/route.ts`.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const params = new URL(request.url).searchParams;

    const parsed = startInstallSchema.safeParse({ orgId: params.get("orgId") });

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Pick an organization", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    await assertOrgAdmin(parsed.data.orgId, user);

    const state = signInstallState({
      organizationId: parsed.data.orgId,
      userId: user.id,
    });

    const target = new URL(getInstallationUrl());
    target.searchParams.set("state", state);

    return NextResponse.redirect(target);
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
