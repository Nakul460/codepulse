import { NextResponse } from "next/server";
import { configureGithubAppWebhook, getGithubAppWebhookStatus } from "@/lib/github";
import { assertOrgAdmin } from "@/lib/organizations";
import { assertSameOrigin, assertWriteScope, requireAuth, requireUser, toErrorResponse } from "@/lib/session";

async function authorize(user: Awaited<ReturnType<typeof requireUser>>, orgId: string) {
  await assertOrgAdmin(orgId, user);
}

export async function GET(request: Request) {
  try {
    const orgId = new URL(request.url).searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ message: "Pick an organization" }, { status: 422 });
    await authorize(await requireUser(request), orgId);
    return NextResponse.json({ webhook: await getGithubAppWebhookStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const orgId = new URL(request.url).searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ message: "Pick an organization" }, { status: 422 });
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    await authorize(auth.user, orgId);
    return NextResponse.json({ webhook: await configureGithubAppWebhook() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
