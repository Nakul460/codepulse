import { NextResponse } from "next/server";
import { z } from "zod";
import { connectProjectDB } from "@/db/db";
import { organizationMemberModel, organizationModel } from "@/db/schema";
import { listOrganizations, uniqueSlug } from "@/lib/organizations";
import {
  assertSameOrigin,
  assertWriteScope,
  requireAuth,
  requireUser,
  toErrorResponse,
} from "@/lib/session";
import { createOrganizationSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({
      organizations: await listOrganizations(user),
    });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const parsed = createOrganizationSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid organization", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    await connectProjectDB();

    const slug = await uniqueSlug(parsed.data.name);

    const organization = await organizationModel.create({
      name: parsed.data.name,
      slug,
      createdBy: user.id,
    });

    await organizationMemberModel.create({
      organizationId: organization._id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: "admin",
    });

    return NextResponse.json(
      {
        organization: {
          id: String(organization._id),
          name: organization.name,
          slug: organization.slug,
          role: "admin",
          memberCount: 1,
          projectCount: 0,
          createdAt: organization.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("create organization error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
