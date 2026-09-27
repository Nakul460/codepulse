import { Types } from "mongoose";
import { connectProjectDB } from "@/db/db";
import {
  githubInstallationModel,
  githubBranchModel,
  githubCommitModel,
  githubDeploymentModel,
  githubIssueModel,
  githubPullRequestModel,
  organizationMemberModel,
  repositoryModel,
  repositorySyncStateModel,
} from "@/db/schema";
import type { GitHubRepository } from "@/lib/github";
import { getOrgRole, logOrgActivity } from "@/lib/organizations";
import {
  ForbiddenError,
  NotFoundError,
  type SessionUser,
} from "@/lib/session";
import type { OrgRole } from "@/lib/project-status";

export interface SerializedRepository {
  id: string;
  organizationId: string;
  installationId: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  defaultBranch: string | null;
  language: string | null;
  htmlUrl: string;
  lastSyncedAt: string | null;
  connectedAt: string;
  syncStatus: "queued" | "running" | "complete" | "partial" | "failed" | null;
  syncStartedAt: string | null;
  syncCompletedAt: string | null;
  syncError: string | null;
  syncTruncated: boolean;
  syncCounts: { commits: number; pullRequests: number; issues: number; branches: number; deployments: number } | null;
}

function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}

function serializeRepository(
  doc: Record<string, unknown>,
  syncState?: Record<string, unknown> | null,
): SerializedRepository {
  return {
    id: String(doc._id),
    organizationId: String(doc.organizationId),
    installationId: String(doc.installationId),
    githubId: Number(doc.githubId),
    owner: String(doc.owner),
    name: String(doc.name),
    fullName: String(doc.fullName),
    isPrivate: Boolean(doc.isPrivate),
    isFork: Boolean(doc.isFork),
    isArchived: Boolean(doc.isArchived),
    defaultBranch: (doc.defaultBranch as string) ?? null,
    language: (doc.language as string) ?? null,
    htmlUrl: String(doc.htmlUrl),
    lastSyncedAt: doc.lastSyncedAt
      ? new Date(doc.lastSyncedAt as string).toISOString()
      : null,
    connectedAt: new Date(doc.createdAt as string).toISOString(),
    syncStatus: (syncState?.status as SerializedRepository["syncStatus"]) ?? null,
    syncStartedAt: syncState?.startedAt ? new Date(syncState.startedAt as string | Date).toISOString() : null,
    syncCompletedAt: syncState?.completedAt ? new Date(syncState.completedAt as string | Date).toISOString() : null,
    syncError: (syncState?.lastError as string | null) ?? null,
    syncTruncated: Boolean(syncState?.truncated),
    syncCounts: (syncState?.counts as SerializedRepository["syncCounts"]) ?? null,
  };
}

/**
 * Repositories visible to the user: every one in the organizations they belong
 * to. Omitting `organizationId` returns all of them, mirroring
 * `listProjects`.
 */
export async function listRepositories(
  user: SessionUser,
  options: { organizationId?: string } = {},
): Promise<SerializedRepository[]> {
  await connectProjectDB();

  const memberships = await organizationMemberModel
    .find({ userId: user.id })
    .select("organizationId")
    .lean();

  const orgIds = memberships.map((m) => m.organizationId);

  if (options.organizationId) {
    if (!isValidObjectId(options.organizationId)) {
      return [];
    }

    // Asked for an org they are not in: report nothing rather than confirm it
    // exists.
    if (!orgIds.some((id) => String(id) === options.organizationId)) {
      return [];
    }
  }

  const filter = options.organizationId
    ? { organizationId: options.organizationId }
    : { organizationId: { $in: orgIds } };

  const repositories = await repositoryModel
    .find(filter)
    .sort({ fullName: 1 })
    .lean();

  const syncStates = await repositorySyncStateModel.find({ repositoryId: { $in: repositories.map((repo) => repo._id) } }).lean();
  const syncByRepository = new Map(syncStates.map((state) => [String(state.repositoryId), state]));
  return repositories.map((repo) => serializeRepository(repo as unknown as Record<string, unknown>, syncByRepository.get(String(repo._id)) as unknown as Record<string, unknown> | undefined));
}

export async function getRepository(
  repositoryId: string,
  user: SessionUser,
): Promise<SerializedRepository> {
  await connectProjectDB();

  if (!isValidObjectId(repositoryId)) {
    throw new NotFoundError("Repository not found");
  }

  const repo = await repositoryModel.findById(repositoryId).lean();

  if (!repo) {
    throw new NotFoundError("Repository not found");
  }

  const membership = await organizationMemberModel
    .findOne({ organizationId: repo.organizationId, userId: user.id })
    .select("_id")
    .lean();

  // Not a member of the owning org: 404 rather than 403, so the repository's
  // existence stays hidden.
  if (!membership) {
    throw new NotFoundError("Repository not found");
  }

  const syncState = await repositorySyncStateModel.findOne({ repositoryId: repo._id }).lean();
  return serializeRepository(repo as unknown as Record<string, unknown>, syncState as unknown as Record<string, unknown> | null);
}

/**
 * Records the installation and attaches every repository the App was granted.
 *
 * Returns the attached repositories plus the ones skipped, so the caller can
 * tell the user why a repository they granted access to is missing.
 */
export async function recordInstallation(input: {
  actor: SessionUser;
  organizationId: string;
  installationId: string;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositories: GitHubRepository[];
}): Promise<{
  attached: SerializedRepository[];
  skipped: { fullName: string; reason: string }[];
}> {
  await connectProjectDB();

  const installation = await githubInstallationModel
    .findOneAndUpdate(
      { installationId: input.installationId },
      {
        $set: {
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          suspendedAt: null,
        },
        $setOnInsert: {
          organizationId: input.organizationId,
          connectedBy: input.actor.id,
          connectedByName: input.actor.name,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    .lean();

  // The App can be installed on several accounts, but one installation may
  // only ever back one CodePulse organization. Re-pointing it would silently
  // move every repository it backs, so refuse instead.
  if (String(installation.organizationId) !== input.organizationId) {
    throw new ForbiddenError(
      "That GitHub App installation is already linked to another organization.",
    );
  }

  const skipped: { fullName: string; reason: string }[] = [];

  if (input.repositories.length === 0) {
    return { attached: [], skipped };
  }

  // One read for the whole batch rather than a lookup per repository: an
  // installation routinely covers hundreds, and this runs inside a request.
  const owners = [...new Set(input.repositories.map((r) => r.owner.login.toLowerCase()))];
  const existing = await repositoryModel
    .find({ owner: { $in: owners } })
    .select("owner name organizationId")
    .lean();

  const ownerByRepo = new Map(
    existing.map((doc) => [
      `${String(doc.owner).toLowerCase()}/${String(doc.name).toLowerCase()}`,
      String(doc.organizationId),
    ]),
  );

  const operations = [];

  for (const repo of input.repositories) {
    const owner = repo.owner.login.toLowerCase();
    const fullName = repo.full_name.toLowerCase();
    const currentOwner = ownerByRepo.get(`${owner}/${repo.name.toLowerCase()}`);

    if (currentOwner && currentOwner !== input.organizationId) {
      // Never steal a repository from the organization that already has it.
      skipped.push({
        fullName,
        reason: "Already connected to another organization",
      });
      continue;
    }

    operations.push({
      updateOne: {
        filter: { owner, name: repo.name },
        update: {
          $set: {
            installationId: input.installationId,
            githubId: repo.id,
            owner,
            name: repo.name,
            fullName,
            isPrivate: repo.private,
            isFork: repo.fork,
            isArchived: repo.archived,
            defaultBranch: repo.default_branch,
            language: repo.language,
            htmlUrl: repo.html_url,
          },
          $setOnInsert: {
            organizationId: input.organizationId,
            connectedBy: input.actor.id,
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    await repositoryModel.bulkWrite(operations, { ordered: false });
  }

  // Re-read rather than reconstructing from the payload: `createdAt` and the
  // server defaults only exist on the stored document.
  const attachedDocs = await repositoryModel
    .find({
      owner: { $in: [...new Set(operations.map((op) => op.updateOne.filter.owner))] },
    })
    .sort({ fullName: 1 })
    .lean();

  const skippedNames = new Set(skipped.map((s) => s.fullName));
  const attached = attachedDocs
    .filter((doc) => !skippedNames.has(String(doc.fullName)))
    .map((doc) => serializeRepository(doc as unknown as Record<string, unknown>));

  await logOrgActivity({
    organizationId: input.organizationId,
    actor: input.actor,
    action: "github.installed",
    target: input.accountLogin,
    metadata: {
      installationId: input.installationId,
      attached: attached.length,
      skipped: skipped.length,
    },
  });

  return { attached, skipped };
}

/** Detaches a repository. Org admin only; the installation is left in place. */
export async function disconnectRepository(
  repositoryId: string,
  user: SessionUser,
) {
  await connectProjectDB();

  if (!isValidObjectId(repositoryId)) {
    throw new NotFoundError("Repository not found");
  }

  const repo = await repositoryModel.findById(repositoryId).lean();

  if (!repo) {
    throw new NotFoundError("Repository not found");
  }

  const role: OrgRole | null = await getOrgRole(String(repo.organizationId), user.id);

  if (role !== "admin") {
    throw new NotFoundError("Repository not found");
  }

  await Promise.all([
    repositoryModel.deleteOne({ _id: repositoryId }),
    repositorySyncStateModel.deleteOne({ repositoryId: repo._id }),
    githubBranchModel.deleteMany({ repositoryId: repo.githubId }),
    githubCommitModel.deleteMany({ repositoryId: repo.githubId }),
    githubDeploymentModel.deleteMany({ repositoryId: repo.githubId }),
    githubIssueModel.deleteMany({ repositoryId: repo.githubId }),
    githubPullRequestModel.deleteMany({ repositoryId: repo.githubId }),
  ]);

  await logOrgActivity({
    organizationId: String(repo.organizationId),
    actor: user,
    action: "repo.disconnected",
    target: String(repo.fullName),
  });

  return String(repo.fullName);
}
