import { NextRequest, NextResponse } from "next/server";
import { getProject, listActivity } from "@/lib/projects";
import {
  requireUser,
  toErrorResponse,
} from "@/lib/session";

type Context = RouteContext<"/api/projects/[projectId]/activity">;

export async function GET(request: NextRequest, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { projectId } = await ctx.params;

    await getProject(projectId, user);

    // `Number(null)` is 0, not NaN, so the default has to be applied with ??
    // before converting or an absent param silently becomes a limit of 1.
    const raw = request.nextUrl.searchParams.get("limit");
    const requested = raw === null ? 50 : Number(raw);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), 200)
      : 50;

    return NextResponse.json({ activity: await listActivity(projectId, limit) });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
