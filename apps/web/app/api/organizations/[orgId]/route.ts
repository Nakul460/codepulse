import { NextResponse } from "next/server";
import { z } from "zod";
import { connectProjectDB } from "@/db/db";
import {
  organizationMemberModel,
  organizationModel,
  projectModel,
} from "@/db/schema";
import {
  getOrganization,
  assertOrgAdmin,
  logOrgActivity,
} from "@/lib/organizations";
import {
  assertSameOrigin,
  assertWriteScope,
  requireAuth,
  requireUser,
  toErrorResponse,
} from "@/lib/session";
import { updateOrganizationSchema } from "@/lib/validation";

type Context = RouteContext<"/api/organizations/[orgId]">;

export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { orgId } = await ctx.params;

    return NextResponse.json({
      organization: await getOrganization(orgId, user),
    });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

export async function PATCH(request: Request, ctx: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWriteScope(auth);
    const user = auth.user;
    const { orgId } = await ctx.params;

    await assertOrgAdmin(orgId, user);

    const parsed = updateOrganizationSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid organization", issues: z.flattenError(parsed.error) },
        { status: 422 },
      );
    }

    await connectProjectDB();

    const before = await organizationModel.findById(orgId).select("name").lean();
    const previousName = before?.name ?? "";

    const organization = await organizationModel
      .findByIdAndUpdate(orgId, { $set: { name: parsed.data.name } }, { new: true })
      .lean();

    if (!organization) {
      return NextResponse.json(
        { message: "Organization not found" },
        { status: 404 },
      );
    }

    await logOrgActivity({
      organizationId: orgId,
      actor: user,
      action: "org.renamed",
      metadata: { from: previousName, to: organization.name },
    });

    return NextResponse.json({
      organization: {
        id: String(organization._id),
        name: organization.name,
        slug: organization.slug,
      },
    });
  } catch (error) {
    console.error("update organization error:", error);
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
    const { orgId } = await ctx.params;

    await assertOrgAdmin(orgId, user);
    await connectProjectDB();

    const projectCount = await projectModel.countDocuments({
      organizationId: orgId,
    });

    if (projectCount > 0) {
      return NextResponse.json(
        {
          message: `This organization still has ${projectCount} project(s). Delete or move them first.`,
        },
        { status: 409 },
      );
    }

    // Written before the delete so the trail survives the org being removed.
    await logOrgActivity({
      organizationId: orgId,
      actor: user,
      action: "org.deleted",
    });

    await Promise.all([
      organizationModel.deleteOne({ _id: orgId }),
      organizationMemberModel.deleteMany({ organizationId: orgId }),
    ]);

    return NextResponse.json({ message: "Organization deleted" });
  } catch (error) {
    console.error("delete organization error:", error);
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
