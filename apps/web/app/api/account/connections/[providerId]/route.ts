import { NextResponse } from "next/server";
import { unlinkProviderAccount } from "@/lib/account";
import {
  assertSameOrigin,
  requireSessionUser,
  toErrorResponse,
} from "@/lib/session";
import { unlinkProviderSchema } from "@/lib/validation";

/**
 * Disconnect a linked GitHub or Google account.
 *
 * The credential ("email/password") account is not unlinkable, and neither is a
 * provider that has no `unlinkAccount` support here — `unlinkProviderSchema`
 * restricts this to the two that are, so an unlinkable account is a 422 rather
 * than a confusing better-auth error.
 */
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/account/connections/[providerId]">,
) {
  try {
    await requireSessionUser();
    assertSameOrigin(request);

    const { providerId } = await ctx.params;
    const parsed = unlinkProviderSchema.safeParse({ providerId });

    if (!parsed.success) {
      return NextResponse.json(
        { message: "That account cannot be unlinked" },
        { status: 422 },
      );
    }

    await unlinkProviderAccount(parsed.data.providerId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
