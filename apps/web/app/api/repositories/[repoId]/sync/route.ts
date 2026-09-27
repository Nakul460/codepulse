import { NextResponse } from "next/server";
import { connectProjectDB } from "@/db/db";
import { repositorySyncStateModel } from "@/db/schema";
import { getRepository } from "@/lib/repositories";
import { assertOrgAdmin } from "@/lib/organizations";
import { assertSameOrigin, assertWriteScope, requireAuth, requireUser, toErrorResponse } from "@/lib/session";

type Context = RouteContext<"/api/repositories/[repoId]/sync">;

export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { repoId } = await ctx.params;
    const repository = await getRepository(repoId, user);
    await assertOrgAdmin(repository.organizationId, user);
    await connectProjectDB();
    const state = await repositorySyncStateModel.findOne({ repositoryId: repoId }).lean();
    return NextResponse.json({ sync: state ? {
      status: state.status,
      startedAt: state.startedAt?.toISOString() ?? null,
      completedAt: state.completedAt?.toISOString() ?? null,
      lastError: state.lastError,
      counts: state.counts,
      truncated: state.truncated,
      correlationId: state.correlationId,
    } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const { repoId } = await ctx.params;
    const repository = await getRepository(repoId, auth.user);
    await assertOrgAdmin(repository.organizationId, auth.user);
    const secret = process.env.API_INTERNAL_SECRET;
    if (!secret) return NextResponse.json({ message: "Manual sync is not configured on this deployment" }, { status: 503 });
    const response = await fetch(`${(process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "")}/api/internal/repositories/${encodeURIComponent(repoId)}/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    return NextResponse.json(body, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
