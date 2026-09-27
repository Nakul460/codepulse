import { NextResponse } from "next/server";
import {
  disconnectRepository,
  getRepository,
} from "@/lib/repositories";
import {
  assertSameOrigin,
  assertWriteScope,
  requireAuth,
  requireUser,
  toErrorResponse,
} from "@/lib/session";

type Context = RouteContext<"/api/repositories/[repoId]">;

export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { repoId } = await ctx.params;

    return NextResponse.json({
      repository: await getRepository(repoId, user),
    });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const { repoId } = await ctx.params;

    const fullName = await disconnectRepository(repoId, user);

    return NextResponse.json({ message: `${fullName} disconnected` });
  } catch (error) {
    console.error("disconnect repository error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
