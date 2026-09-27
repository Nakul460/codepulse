import { NextResponse } from "next/server";
import { z } from "zod";
import { listRepositories } from "@/lib/repositories";
import {
  requireUser,
  toErrorResponse,
} from "@/lib/session";
import { listRepositoriesSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const params = new URL(request.url).searchParams;

    const parsed = listRepositoriesSchema.safeParse({
      orgId: params.get("orgId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid request", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    return NextResponse.json({
      repositories: await listRepositories(user, {
        organizationId: parsed.data.orgId,
      }),
    });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
