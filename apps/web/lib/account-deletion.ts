import {
  accessTokenModel,
  organizationMemberModel,
  organizationModel,
  projectMemberModel,
} from "@/db/schema";
import type { Types } from "mongoose";

/**
 * What deleting a CodePulse account has to do to CodePulse-owned data.
 *
 * better-auth's `user.deleteUser.afterDelete` removes the user row, their
 * sessions and their linked accounts, and knows nothing about anything below.
 * This module covers the rest.
 *
 * ## The one thing that blocks deletion
 *
 * `Organization` has `createdBy`, not an `ownerId`, and there is no ownership
 * transfer. So when the last admin of an organization deletes their account
 * there are two bad options: delete the organization (destroying every
 * project's history for the other members, none of whom consented) or leave it
 * with no admin (unmanageable and unrecoverable). Neither is acceptable as a
 * side effect of someone closing their own account, so it is refused up front
 * with the list of organizations to fix. A user who is *one of several* admins
 * is simply removed from the organization, which is the normal case.
 */
export interface AccountDeletionBlocker {
  organizationId: string;
  organizationName: string;
  memberCount: number;
}

/**
 * Organizations whose admin list would be left empty if `userId` disappeared.
 *
 * An empty result means the account can be deleted.
 */
export async function findAccountDeletionBlockers(
  userId: string,
): Promise<AccountDeletionBlocker[]> {
  const adminMemberships = await organizationMemberModel
    .find({ userId, role: "admin" })
    .select("organizationId")
    .lean();

  if (adminMemberships.length === 0) {
    return [];
  }

  const organizationIds = adminMemberships.map((membership) =>
    membership.organizationId,
  );

  // Count admins per organization in one aggregation rather than a query per
  // organization, and fetch the names in the same round trip.
  const [adminCounts, organizations, memberCounts] = await Promise.all([
    organizationMemberModel
      .aggregate<{ _id: Types.ObjectId; admins: number }>([
        { $match: { organizationId: { $in: organizationIds }, role: "admin" } },
        { $group: { _id: "$organizationId", admins: { $sum: 1 } } },
      ]),
    organizationModel
      .find({ _id: { $in: organizationIds } })
      .select("name")
      .lean(),
    organizationMemberModel
      .aggregate<{ _id: Types.ObjectId; members: number }>([
        { $match: { organizationId: { $in: organizationIds } } },
        { $group: { _id: "$organizationId", members: { $sum: 1 } } },
      ]),
  ]);

  const adminCountBy = new Map(
    adminCounts.map((row) => [row._id.toString(), row.admins]),
  );
  const memberCountBy = new Map(
    memberCounts.map((row) => [row._id.toString(), row.members]),
  );

  return organizations
    .filter((organization) => adminCountBy.get(organization._id.toString()) === 1)
    .map((organization) => ({
      organizationId: organization._id.toString(),
      organizationName: organization.name,
      memberCount: memberCountBy.get(organization._id.toString()) ?? 0,
    }));
}

export interface DeletedAccountData {
  accessTokens: number;
  organizationMemberships: number;
  projectMemberships: number;
}

/**
 * Removes the rows that reference a now-deleted user.
 *
 * Called from better-auth's `afterDelete` hook. Deliberately does **not** touch
 * `organizationActivity` or `projectActivity`: those are the audit trail for
 * organizations and projects that outlive this account, and an audit log that
 * can be erased by the actor it describes is not an audit log. Leaving
 * `actorId`/`actorName` behind is the point.
 */
export async function deleteUserOwnedData(
  userId: string,
): Promise<DeletedAccountData> {
  const [accessTokens, organizationMemberships, projectMemberships] =
    await Promise.all([
      accessTokenModel.deleteMany({ userId }),
      organizationMemberModel.deleteMany({ userId }),
      projectMemberModel.deleteMany({ userId }),
    ]);

  return {
    accessTokens: accessTokens.deletedCount,
    organizationMemberships: organizationMemberships.deletedCount,
    projectMemberships: projectMemberships.deletedCount,
  };
}
