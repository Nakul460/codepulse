import { Types } from "mongoose";
import { connectProjectDB } from "@/db/db";
import {
  organizationMemberModel,
  projectActivityModel,
  projectMemberModel,
  projectModel,
} from "@/db/schema";
import {
  ForbiddenError,
  NotFoundError,
  type SessionUser,
} from "@/lib/session";
import { projectCan } from "@codepulse/shared";
import type { MemberRole } from "@/lib/project-status";

/**
 * Effective access is resolved in this order:
 *   1. Org admin  -> owner  (full control of every project in the org)
 *   2. Org member -> editor (can create, edit and archive)
 *   3. Project member -> their explicit role (covers outside collaborators)
 *   4. Otherwise no access.
 */
export async function resolveProjectRole(
  project: { organizationId: unknown; _id: unknown },
  userId: string,
): Promise<MemberRole | null> {
  const orgMembership = await organizationMemberModel
    .findOne({ organizationId: project.organizationId, userId })
    .select("role")
    .lean();

  if (orgMembership) {
    return orgMembership.role === "admin" ? "owner" : "editor";
  }

  const projectMembership = await projectMemberModel
    .findOne({ projectId: project._id, userId })
    .select("role")
    .lean();

  return (projectMembership?.role as MemberRole) ?? null;
}

/*
 * Thin aliases over the shared permission matrix.
 *
 * These names predate `packages/shared/src/permissions.ts` and are kept because
 * call sites read better as `canEdit(role)` than `projectCan(role, "edit")`.
 * They deliberately contain **no role logic** — the matrix in `shared` is the
 * single source of truth, and these just forward to it, so the web app, the API
 * service and the UI cannot disagree about what a role may do.
 */
export function canView(role: MemberRole | null) {
  return projectCan(role, "view");
}

export function canEdit(role: MemberRole | null) {
  return projectCan(role, "edit");
}

export function canArchive(role: MemberRole | null) {
  return projectCan(role, "archive");
}

export function canManageMembers(role: MemberRole | null) {
  return projectCan(role, "manage_members");
}

export function canDelete(role: MemberRole | null) {
  return projectCan(role, "delete");
}

function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}

export interface SerializedProject {
  id: string;
  organizationId: string;
  projectName: string;
  description: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budget: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: MemberRole;
}

export function serializeProject(
  doc: Record<string, unknown>,
  role: MemberRole,
): SerializedProject {
  const toIso = (value: unknown) =>
    value ? new Date(value as string).toISOString() : null;

  return {
    id: String(doc._id),
    organizationId: String(doc.organizationId),
    projectName: String(doc.projectName ?? ""),
    description: String(doc.description ?? ""),
    status: String(doc.status ?? "ongoing"),
    startDate: toIso(doc.startDate),
    endDate: toIso(doc.endDate),
    budget: Number(doc.budget ?? 0),
    archivedAt: toIso(doc.archivedAt),
    createdAt: toIso(doc.createdAt) as string,
    updatedAt: toIso(doc.updatedAt) as string,
    role,
  };
}

export async function listProjects(
  user: SessionUser,
  options: { organizationId?: string; archived?: boolean } = {},
) {
  await connectProjectDB();

  const orgFilter = options.organizationId
    ? { organizationId: options.organizationId }
    : {};

  const memberships = await organizationMemberModel
    .find({ userId: user.id })
    .select("organizationId role")
    .lean();

  const orgIds = memberships.map((m) => m.organizationId);

  if (options.organizationId && !orgIds.some((id) => String(id) === options.organizationId)) {
    // Caller asked for an org they are not in: report no projects rather than
    // leaking whether the org exists.
    return [];
  }

  const orgRoleById = new Map(
    memberships.map((m) => [String(m.organizationId), m.role]),
  );

  const projectMemberships = await projectMemberModel
    .find({ userId: user.id })
    .select("projectId role")
    .lean();

  const projectRoleById = new Map(
    projectMemberships.map((m) => [String(m.projectId), m.role as MemberRole]),
  );

  const projects = await projectModel
    .find({
      ...orgFilter,
      archivedAt: options.archived === true ? { $ne: null } : null,
      $or: [
        { organizationId: { $in: orgIds } },
        { _id: { $in: [...projectRoleById.keys()] } },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  return projects.map((project) => {
    const orgRole = orgRoleById.get(String(project.organizationId));
    const role: MemberRole = orgRole
      ? orgRole === "admin"
        ? "owner"
        : "editor"
      : (projectRoleById.get(String(project._id)) ?? "viewer");

    return serializeProject(project as unknown as Record<string, unknown>, role);
  });
}

export async function getProject(
  projectId: string,
  user: SessionUser,
): Promise<SerializedProject> {
  await connectProjectDB();

  if (!isValidObjectId(projectId)) {
    throw new NotFoundError("Project not found");
  }

  const project = await projectModel.findById(projectId).lean();

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const role = await resolveProjectRole(
    project as unknown as { organizationId: unknown; _id: unknown },
    user.id,
  );

  if (!role) {
    // Do not leak the existence of other people's projects.
    throw new NotFoundError("Project not found");
  }

  return serializeProject(project as unknown as Record<string, unknown>, role);
}

export async function assertCanEdit(projectId: string, user: SessionUser) {
  const project = await getProject(projectId, user);

  if (!canEdit(project.role)) {
    throw new ForbiddenError("You need editor access to change this project");
  }

  return project;
}

export async function assertCanManageMembers(
  projectId: string,
  user: SessionUser,
) {
  const project = await getProject(projectId, user);

  if (!canManageMembers(project.role)) {
    throw new ForbiddenError("Only the project owner can manage members");
  }

  return project;
}

export async function assertCanDelete(projectId: string, user: SessionUser) {
  const project = await getProject(projectId, user);

  if (!canDelete(project.role)) {
    throw new ForbiddenError("Only the project owner can delete a project");
  }

  return project;
}

export async function logActivity(input: {
  projectId: string;
  actor: SessionUser;
  action: string;
  changes?: string[];
  metadata?: Record<string, unknown> | null;
  /** Derived from the project when omitted, so callers cannot get it wrong. */
  organizationId?: string;
}) {
  const organizationId =
    input.organizationId ??
    (
      await projectModel
        .findById(input.projectId)
        .select("organizationId")
        .lean()
    )?.organizationId;

  if (!organizationId) {
    // The project is gone (deleted); there is nothing left to attach to.
    return;
  }

  await projectActivityModel.create({
    projectId: input.projectId,
    organizationId,
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email,
    action: input.action,
    changes: input.changes ?? [],
    metadata: input.metadata ?? null,
  });
}

export async function listActivity(projectId: string, limit = 50) {
  const activities = await projectActivityModel
    .find({ projectId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return activities.map((activity) => ({
    id: String(activity._id),
    action: activity.action,
    actorId: activity.actorId,
    actorName: activity.actorName,
    changes: activity.changes ?? [],
    metadata: activity.metadata ?? null,
    createdAt: new Date(activity.createdAt as string).toISOString(),
  }));
}

export async function listMembers(projectId: string) {
  const members = await projectMemberModel
    .find({ projectId })
    .sort({ createdAt: 1 })
    .lean();

  return members.map((member) => ({
    id: String(member._id),
    userId: member.userId,
    email: member.email,
    name: member.name,
    role: member.role as MemberRole,
    joinedAt: new Date(member.createdAt as string).toISOString(),
  }));
}
