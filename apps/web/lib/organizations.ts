import { Types } from "mongoose";
import { connectProjectDB } from "@/db/db";
import {
  organizationActivityModel,
  organizationMemberModel,
  organizationModel,
  projectModel,
} from "@/db/schema";
import {
  NotFoundError,
  type SessionUser,
} from "@/lib/session";
import { orgCan, type OrgPermission } from "@codepulse/shared";
import type { OrgRole } from "@/lib/project-status";
import { slugify } from "@/lib/slug";

export { slugify };

export interface SerializedOrganization {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  memberCount: number;
  projectCount: number;
  createdAt: string;
}

export interface SerializedOrgMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: OrgRole;
  joinedAt: string;
}

function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}

/** Appends -2, -3 … until the slug is free. */
async function uniqueSlug(name: string) {
  const base = slugify(name) || "organization";
  let candidate = base;
  let suffix = 1;

  // Bounded so a pathological collision set cannot spin forever.
  while (suffix < 100) {
    const existing = await organizationModel
      .findOne({ slug: candidate })
      .select("_id")
      .lean();

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return `${base}-${Date.now()}`;
}

export async function getOrgRole(
  organizationId: string,
  userId: string,
): Promise<OrgRole | null> {
  const membership = await organizationMemberModel
    .findOne({ organizationId, userId })
    .select("role")
    .lean();

  return (membership?.role as OrgRole) ?? null;
}

export async function listOrganizations(
  user: SessionUser,
): Promise<SerializedOrganization[]> {
  await connectProjectDB();

  const memberships = await organizationMemberModel
    .find({ userId: user.id })
    .lean();

  if (memberships.length === 0) {
    return [];
  }

  const orgIds = memberships.map((m) => m.organizationId);

  const [orgs, memberCounts, projectCounts] = await Promise.all([
    organizationModel
      .find({ _id: { $in: orgIds } })
      .sort({ name: 1 })
      .lean(),
    organizationMemberModel.aggregate<{ _id: string; count: number }>([
      { $match: { organizationId: { $in: orgIds } } },
      { $group: { _id: "$organizationId", count: { $sum: 1 } } },
    ]),
    projectModel.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          organizationId: { $in: orgIds },
          archivedAt: null,
        },
      },
      { $group: { _id: "$organizationId", count: { $sum: 1 } } },
      { $project: { _id: 0, count: 1 } },
    ]),
  ]);

  const roleByOrg = new Map(
    memberships.map((m) => [String(m.organizationId), m.role as OrgRole]),
  );
  const membersByOrg = new Map(
    memberCounts.map((m) => [String(m._id), m.count]),
  );
  const projectsByOrg = new Map(
    projectCounts.map((p) => [String(p._id), p.count]),
  );

  return orgs.map((org) => ({
    id: String(org._id),
    name: org.name,
    slug: org.slug,
    role: roleByOrg.get(String(org._id)) ?? "member",
    memberCount: membersByOrg.get(String(org._id)) ?? 0,
    projectCount: projectsByOrg.get(String(org._id)) ?? 0,
    createdAt: new Date(org.createdAt as string).toISOString(),
  }));
}

export async function getOrganization(
  organizationId: string,
  user: SessionUser,
): Promise<SerializedOrganization> {
  await connectProjectDB();

  if (!isValidObjectId(organizationId)) {
    throw new NotFoundError("Organization not found");
  }

  const role = await getOrgRole(organizationId, user.id);

  if (!role) {
    throw new NotFoundError("Organization not found");
  }

  const org = await organizationModel.findById(organizationId).lean();

  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  const [memberCount, projectCount] = await Promise.all([
    organizationMemberModel.countDocuments({ organizationId }),
    projectModel.countDocuments({ organizationId, archivedAt: null }),
  ]);

  return {
    id: String(org._id),
    name: org.name,
    slug: org.slug,
    role,
    memberCount,
    projectCount,
    createdAt: new Date(org.createdAt as string).toISOString(),
  };
}

/**
 * Throws unless the user holds `permission` in this organization.
 *
 * The failure is deliberately a **404 "Organization not found"** rather than a
 * 403, and that is the single most important detail here: a 403 would confirm
 * the organization exists to someone who is not in it, turning the route table
 * into a membership oracle. So a non-member, a plain member asking for an
 * admin action, and a caller with a malformed id all get the same answer.
 *
 * The permission itself comes from the shared matrix — this function does not
 * decide who may do what, it only resolves the caller's role and asks.
 */
export async function assertOrgPermission(
  organizationId: string,
  user: SessionUser,
  permission: OrgPermission,
): Promise<OrgRole> {
  // Without this a malformed id surfaces as a CastError (500) instead of the
  // 404 that keeps org existence hidden from non-members.
  if (!isValidObjectId(organizationId)) {
    throw new NotFoundError("Organization not found");
  }

  const role = await getOrgRole(organizationId, user.id);

  if (!orgCan(role, permission)) {
    // Same reasoning as projects: do not confirm the org exists to outsiders.
    throw new NotFoundError("Organization not found");
  }

  return role as OrgRole;
}

/**
 * The previous single admin gate, kept as a named alias so the diff against the
 * original `assertOrgAdmin` reads as intent rather than a rename sweep.
 *
 * It is now expressed as a **permission**, not a role comparison, so introducing
 * a new role that can manage members (a "manager", say) does not require
 * touching every call site. Today only `admin` holds `manage_members`, so the
 * behaviour is identical to the old `role !== "admin"` check.
 */
export async function assertOrgAdmin(
  organizationId: string,
  user: SessionUser,
) {
  return assertOrgPermission(organizationId, user, "manage_members");
}

/** Same 404-not-403 rule as `assertOrgPermission`, for read-only access. */
export async function assertOrgViewer(
  organizationId: string,
  user: SessionUser,
): Promise<OrgRole> {
  return assertOrgPermission(organizationId, user, "view");
}

export async function listOrgMembers(
  organizationId: string,
): Promise<SerializedOrgMember[]> {
  const members = await organizationMemberModel
    .find({ organizationId })
    .sort({ createdAt: 1 })
    .lean();

  return members.map((member) => ({
    id: String(member._id),
    userId: member.userId,
    email: member.email,
    name: member.name,
    role: member.role as OrgRole,
    joinedAt: new Date(member.createdAt as string).toISOString(),
  }));
}

export async function countOrgAdmins(organizationId: string) {
  return organizationMemberModel.countDocuments({
    organizationId,
    role: "admin",
  });
}

/**
 * Record an organization-level event. Deliberately never throws: a failure to
 * write the audit trail must not roll back (or 500) the mutation the user
 * actually asked for, but it is logged so the gap is visible.
 */
export async function logOrgActivity(input: {
  organizationId: string;
  actor: SessionUser;
  action: string;
  target?: string;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await connectProjectDB();
    await organizationActivityModel.create({
      organizationId: input.organizationId,
      actorId: input.actor.id,
      actorName: input.actor.name || input.actor.email,
      action: input.action,
      target: input.target ?? "",
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error(
      `[audit] failed to record ${input.action} for org ${input.organizationId}:`,
      error,
    );
  }
}

export { uniqueSlug, isValidObjectId };
