import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { connectProjectDB } from "@/db/db";
import {
  organizationInvitationModel,
  organizationMemberModel,
  organizationModel,
} from "@/db/schema";
import { isValidObjectId, logOrgActivity } from "@/lib/organizations";
import { ORG_ROLES, type OrgRole } from "@codepulse/shared";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type SessionUser,
} from "@/lib/session";

/**
 * Whether a Mongo write failed a unique index.
 *
 * Checks the code rather than the message text, because the message is driver
 * and version dependent but `code: 11000` is the server's own contract.
 */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/** How long an invitation stays acceptable. */
export const INVITATION_TTL_DAYS = 7;

const TOKEN_BYTES = 32;

/** Shape check for a raw invitation token: 32 bytes rendered as hex. */
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export interface SerializedInvitation {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: OrgRole;
  status: string;
  invitedByName: string;
  expiresAt: string;
  /**
   * Whether the invitation can still be accepted, decided server-side.
   *
   * Computed here rather than in the UI because `Date.now()` during render is
   * not a pure function of props and state, and more importantly because the
   * server is the only place that can say whether the token is still usable.
   */
  isExpired: boolean;
  createdAt: string;
  respondedAt: string | null;
}

/** The raw token is returned exactly once, to be emailed. Never persisted. */
export interface CreatedInvitation {
  invitation: SerializedInvitation;
  token: string;
}

function serialize(
  document: {
    _id: unknown;
    organizationId: unknown;
    email: string;
    role: string;
    status: string;
    invitedByName: string;
    expiresAt: Date;
    createdAt: Date | string;
    respondedAt: Date | null;
  },
  organizationName: string,
): SerializedInvitation {
  return {
    id: String(document._id),
    organizationId: String(document.organizationId),
    organizationName,
    email: document.email,
    role: document.role as OrgRole,
    status: document.status,
    invitedByName: document.invitedByName,
    expiresAt: new Date(document.expiresAt).toISOString(),
    isExpired: new Date(document.expiresAt).getTime() <= Date.now(),
    createdAt: new Date(document.createdAt).toISOString(),
    respondedAt: document.respondedAt
      ? new Date(document.respondedAt).toISOString()
      : null,
  };
}

/** An invitation is only actionable while pending and unexpired. */
export function isActionable(invitation: { status: string; expiresAt: Date }) {
  return (
    invitation.status === "pending" && invitation.expiresAt.getTime() > Date.now()
  );
}

/**
 * Invites `email` to `organizationId`.
 *
 * Idempotent per address: an existing **pending** invitation is replaced (fresh
 * token, fresh expiry, possibly a new role) rather than duplicated, which is
 * both the behaviour an admin expects from a re-send and what the unique
 * `{organizationId, email, status}` index enforces. Declined/accepted history
 * is left alone, so re-inviting someone who previously declined works and the
 * record of the earlier answer is not rewritten.
 */
export async function createInvitation(input: {
  organizationId: string;
  email: string;
  role: OrgRole;
  invitedBy: SessionUser;
}): Promise<CreatedInvitation> {
  await connectProjectDB();

  if (!isValidObjectId(input.organizationId)) {
    throw new NotFoundError("Organization not found");
  }

  const email = input.email.toLowerCase();
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(
    Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const organization = await organizationModel
    .findById(input.organizationId)
    .select("name")
    .lean();

  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  // Replacing the live invitation means the old token must stop working *now*,
  // not whenever its document happens to be reaped — the previous token is
  // deleted outright rather than left pending.
  await organizationInvitationModel.deleteOne({
    organizationId: input.organizationId,
    email,
    status: "pending",
  });

  let created;

  try {
    created = await organizationInvitationModel.create({
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      status: "pending",
      invitedByUserId: input.invitedBy.id,
      invitedByName: input.invitedBy.name || input.invitedBy.email,
      expiresAt,
    });
  } catch (error) {
    // Two admins inviting the same address at the same moment both clear the
    // old invitation, and then both try to insert. The partial unique index
    // rejects the loser with E11000. That is a normal outcome of the workflow,
    // not a server fault, so it is reported as a conflict rather than a 500.
    if (isDuplicateKeyError(error)) {
      throw new ConflictError(
        "That address already has a pending invitation. Revoke it first if you want to send a new one.",
      );
    }

    throw error;
  }

  await logOrgActivity({
    organizationId: input.organizationId,
    actor: input.invitedBy,
    action: "org.invited",
    target: email,
    metadata: { role: input.role, expiresAt: expiresAt.toISOString() },
  });

  return {
    token,
    invitation: serialize(
      {
        _id: created._id,
        organizationId: created.organizationId,
        email: created.email,
        role: created.role,
        status: created.status,
        invitedByName: created.invitedByName,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
        respondedAt: null,
      },
      organization.name,
    ),
  };
}

/** Pending invitations for an organization. Admin-facing, so it includes expired. */
export async function listInvitations(
  organizationId: string,
): Promise<SerializedInvitation[]> {
  await connectProjectDB();

  if (!isValidObjectId(organizationId)) {
    throw new NotFoundError("Organization not found");
  }

  const [invitations, organization] = await Promise.all([
    organizationInvitationModel
      .find({ organizationId, status: "pending" })
      .sort({ createdAt: -1 })
      .lean(),
    organizationModel.findById(organizationId).select("name").lean(),
  ]);

  return invitations.map((invitation) =>
    serialize(invitation, organization?.name ?? ""),
  );
}

/**
 * The signed-in user's own pending invitations, across every organization.
 *
 * Matched on **email, not user id**, because the whole point of an invitation
 * is that the recipient may not have an account yet — and an account they have
 * not signed into. This is what makes the dashboard banner able to show an
 * invitation to someone who was invited before they registered.
 */
export async function listInvitationsForUser(
  user: SessionUser,
): Promise<SerializedInvitation[]> {
  await connectProjectDB();

  const invitations = await organizationInvitationModel
    .find({ email: user.email.toLowerCase(), status: "pending" })
    .sort({ createdAt: -1 })
    .lean();

  if (invitations.length === 0) {
    return [];
  }

  const organizations = await organizationModel
    .find({ _id: { $in: invitations.map((i) => i.organizationId) } })
    .select("name")
    .lean();

  const nameById = new Map(organizations.map((o) => [String(o._id), o.name]));

  // An invitation whose org was deleted is not actionable, so hiding it is
  // better than showing a link that 404s on accept.
  return invitations
    .filter((invitation) => nameById.has(String(invitation.organizationId)))
    .map((invitation) =>
      serialize(
        invitation,
        nameById.get(String(invitation.organizationId)) ?? "",
      ),
    );
}

/** Admin-initiated revoke of a pending invitation. */
export async function revokeInvitation(input: {
  organizationId: string;
  invitationId: string;
  actor: SessionUser;
}): Promise<void> {
  await connectProjectDB();

  if (
    !isValidObjectId(input.organizationId) ||
    !isValidObjectId(input.invitationId)
  ) {
    throw new NotFoundError("Invitation not found");
  }

  const invitation = await organizationInvitationModel
    .findOne({
      _id: input.invitationId,
      organizationId: input.organizationId,
      status: "pending",
    })
    .lean();

  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  await organizationInvitationModel.deleteOne({ _id: input.invitationId });

  await logOrgActivity({
    organizationId: input.organizationId,
    actor: input.actor,
    action: "org.invite_revoked",
    target: invitation.email,
  });
}

/**
 * Resolves a raw token from an invite link to its invitation.
 *
 * The token is hashed and looked up, then compared with `timingSafeEqual`.
 * The lookup already narrowed it to one document, so a miss and a wrong-token
 * are both "not found" — the comparison only exists so the check cannot leak
 * through timing, and it is skipped on a null hash rather than throwing.
 */
async function findByToken(
  token: string,
): Promise<(SerializedInvitation & { document: Record<string, unknown> }) | null> {
  await connectProjectDB();

  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
    return null;
  }

  const document = await organizationInvitationModel
    .findOne({ tokenHash: hashToken(token) })
    .select("+tokenHash")
    .lean();

  if (!document?.tokenHash) {
    return null;
  }

  const expected = Buffer.from(document.tokenHash, "hex");
  const provided = Buffer.from(hashToken(token), "hex");

  // Both buffers are 32 bytes by construction (SHA-256 of a fixed-shape input),
  // so timingSafeEqual cannot throw on a length mismatch.
  if (!timingSafeEqual(expected, provided)) {
    return null;
  }

  const organization = await organizationModel
    .findById(document.organizationId)
    .select("name")
    .lean();

  if (!organization) {
    return null;
  }

  return {
    ...serialize(document, organization.name),
    document: document as unknown as Record<string, unknown>,
  };
}

/** Public shape for the invite landing page. */
export async function previewInvitation(token: string) {
  const found = await findByToken(token);

  if (!found) {
    throw new NotFoundError("This invitation is not valid");
  }

  const expired = !isActionable(found.document as unknown as { status: string; expiresAt: Date });

  return {
    organizationName: found.organizationName,
    email: found.email,
    role: found.role,
    invitedByName: found.invitedByName,
    expiresAt: found.expiresAt,
    status: expired && found.status === "pending" ? "expired" : found.status,
  };
}

/**
 * Accepts an invitation, creating the membership.
 *
 * Three separate checks, each of which has bitten this flow before in some
 * other system, so they are spelled out rather than assumed:
 *
 *  1. The token must resolve to a still-pending, unexpired invitation.
 *  2. The signed-in user's email must equal the invited address. Without this
 *     anyone who obtained a forwarded invite link could claim the membership.
 *  3. The user must not already be a member. Re-accepting is a no-op success
 *     rather than a 409, because a double-clicked link is not a user error
 *     worth an error page.
 */
/**
 * Refuses to act on an invitation addressed to a different account.
 *
 * Applied on both accept and decline, and deliberately worded so the error does
 * not confirm the address: naming it would turn the endpoint into a way to test
 * which addresses have been invited.
 */
function assertAddressMatches(
  document: InvitationSubject,
  user: SessionUser,
): void {
  if (document.email !== user.email.toLowerCase()) {
    throw new ForbiddenError(
      "This invitation was sent to a different email address. Sign in with the invited address to accept it.",
    );
  }
}

/** The fields the accept/decline paths need from a stored invitation. */
type InvitationSubject = {
  _id: unknown;
  organizationId: unknown;
  email: string;
  role: OrgRole;
  status: string;
  expiresAt: Date;
};

/**
 * Grants the membership, marks the invitation responded to, and audits it.
 *
 * Shared by the token path (the emailed link) and the by-id path (the dashboard
 * banner) so there is exactly one implementation of "this invitation becomes an
 * organization member".
 *
 * Records are marked responded rather than deleted, and that is what makes both
 * the history and the idempotency real: re-opening an already-accepted link
 * finds the membership and returns it, instead of reporting an invalid token
 * for an invitation the user already acted on.
 */
async function respondToInvitation(input: {
  document: InvitationSubject;
  user: SessionUser;
  organizationName: string;
  accept: boolean;
}): Promise<{ organizationId: string; organizationName: string }> {
  await connectProjectDB();

  const organizationId = String(input.document.organizationId);

  if (input.accept) {
    const existing = await organizationMemberModel
      .findOne({ organizationId, userId: input.user.id })
      .lean();

    if (!existing) {
      // The role comes from the invitation, not from the request body, so an
      // invitee cannot promote themselves by tampering with the accept call.
      await organizationMemberModel.create({
        organizationId,
        userId: input.user.id,
        email: input.document.email,
        name: input.user.name ?? "",
        // The stored role already passed the schema's enum, but it is
        // re-checked here because this value becomes an authorization grant and
        // a hand-edited or migrated document should not be able to invent a role
        // the permission matrix has no row for.
        role: ORG_ROLES.includes(input.document.role)
          ? input.document.role
          : "member",
      });
    }
  }

  await organizationInvitationModel.updateOne(
    { _id: input.document._id, status: "pending" },
    {
      $set: {
        status: input.accept ? "accepted" : "declined",
        respondedAt: new Date(),
        // Blanked so a used token cannot be replayed, and so the hash stops
        // being a live credential the moment the invitation resolves.
        tokenHash: "",
        ...(input.accept ? { acceptedByUserId: input.user.id } : {}),
      },
    },
  );

  await logOrgActivity({
    organizationId,
    actor: input.user,
    action: input.accept ? "org.invite_accepted" : "org.invite_declined",
    target: input.document.email,
    metadata: input.accept ? { role: input.document.role } : undefined,
  });

  return { organizationId, organizationName: input.organizationName };
}

export async function acceptInvitation(input: {
  token: string;
  user: SessionUser;
}): Promise<{ organizationId: string; organizationName: string }> {
  const found = await findByToken(input.token);

  if (!found) {
    throw new NotFoundError("This invitation is not valid");
  }

  const document = found.document as unknown as InvitationSubject;

  if (isActionable(document)) {
    assertAddressMatches(document, input.user);
  } else if (document.status === "accepted") {
    // Already accepted. Return the organization rather than failing, so a
    // double-click, a back button, or reopening the emailed link is harmless.
    return {
      organizationId: String(document.organizationId),
      organizationName: found.organizationName,
    };
  } else if (document.status === "declined") {
    throw new ForbiddenError(
      "This invitation was declined. Ask for a new one if you changed your mind.",
    );
  } else {
    throw new ForbiddenError(
      document.expiresAt.getTime() <= Date.now()
        ? "This invitation has expired. Ask for a new one."
        : "This invitation is no longer pending.",
    );
  }

  return respondToInvitation({
    document,
    user: input.user,
    organizationName: found.organizationName,
    accept: true,
  });
}

/**
 * Declines an invitation.
 *
 * Same email check as accept: a decline is still a state change on someone
 * else's invitation, and without the check a leaked link could be used to make
 * an invitation look refused.
 */
export async function declineInvitation(input: {
  token: string;
  user: SessionUser;
}): Promise<void> {
  const found = await findByToken(input.token);

  if (!found) {
    throw new NotFoundError("This invitation is not valid");
  }

  const document = found.document as unknown as InvitationSubject;

  if (document.status !== "pending") {
    // Nothing to do; a decline of an already-declined invitation is a no-op.
    return;
  }

  assertAddressMatches(document, input.user);

  await respondToInvitation({
    document,
    user: input.user,
    organizationName: found.organizationName,
    accept: false,
  });
}

/**
 * Resolves a pending invitation by id, for the signed-in user's own list.
 *
 * This is the token-free path. The emailed link is the only place a token
 * exists, so a recipient who is already signed in and browsing their dashboard
 * would otherwise have to go back to their inbox to act on an invitation the
 * app already knows is addressed to them. The session for a verified address is
 * the same proof the emailed token provides, so the id is enough.
 *
 * Returns `null` when the id is not a pending invitation addressed to this
 * user, and the callers translate that into a 404. That is deliberate: a
 * distinguishable "exists but not yours" error would turn this into an oracle
 * for which ids are live invitations.
 */
async function findOwnPendingById(
  invitationId: string,
  user: SessionUser,
): Promise<{ document: InvitationSubject; organizationName: string } | null> {
  if (!isValidObjectId(invitationId)) {
    return null;
  }

  await connectProjectDB();

  const document = await organizationInvitationModel
    .findOne({
      _id: invitationId,
      email: user.email.toLowerCase(),
      status: "pending",
    })
    .lean<InvitationSubject>();

  if (!document || !isActionable(document)) {
    return null;
  }

  const organization = await organizationModel
    .findById(document.organizationId)
    .select("name")
    .lean<{ name: string }>();

  // Invitations whose organization was deleted underneath them are not
  // actionable, and the UI should not offer a button that 404s.
  if (!organization) {
    return null;
  }

  return { document, organizationName: organization.name };
}

/**
 * Resolves the `:tokenOrId` path segment to an invitation.
 *
 * The emailed link and the dashboard banner address the same invitation two
 * different ways, and Next requires a single dynamic segment name per position,
 * so one route serves both. The two are told apart by shape, which is safe here
 * because *both* branches independently require the invitation to be addressed
 * to the signed-in address — picking the wrong branch can only fail closed.
 *
 * A value that is neither a 24-character ObjectId nor a 64-character hex token
 * is rejected before any database work.
 */
async function resolveForCaller(
  tokenOrId: string,
  user: SessionUser,
): Promise<{ document: InvitationSubject; organizationName: string }> {
  if (isValidObjectId(tokenOrId)) {
    const own = await findOwnPendingById(tokenOrId, user);

    if (own) {
      return own;
    }
  }

  if (TOKEN_PATTERN.test(tokenOrId)) {
    const found = await findByToken(tokenOrId);

    if (found) {
      return {
        document: found.document as unknown as InvitationSubject,
        organizationName: found.organizationName,
      };
    }
  }

  throw new NotFoundError("This invitation is not valid");
}

/**
 * Accepts an invitation addressed to the caller, from either an emailed token
 * or an id from their own list.
 */
export async function acceptInvitationForCaller(input: {
  tokenOrId: string;
  user: SessionUser;
}): Promise<{ organizationId: string; organizationName: string }> {
  const resolved = await resolveForCaller(input.tokenOrId, input.user);

  // Only the token path can arrive already accepted or declined, because the
  // by-id path only ever matches a pending invitation.
  if (
    resolved.document.status !== "pending" &&
    isActionable(resolved.document) === false
  ) {
    if (resolved.document.status === "accepted") {
      return {
        organizationId: String(resolved.document.organizationId),
        organizationName: resolved.organizationName,
      };
    }

    throw new ForbiddenError("This invitation is no longer pending.");
  }

  assertAddressMatches(resolved.document, input.user);

  return respondToInvitation({
    document: resolved.document,
    user: input.user,
    organizationName: resolved.organizationName,
    accept: true,
  });
}

/** Declines an invitation addressed to the caller, by token or by id. */
export async function declineInvitationForCaller(input: {
  tokenOrId: string;
  user: SessionUser;
}): Promise<void> {
  const resolved = await resolveForCaller(input.tokenOrId, input.user);

  if (resolved.document.status !== "pending") {
    // Nothing to do; declining an already-resolved invitation is a no-op.
    return;
  }

  assertAddressMatches(resolved.document, input.user);

  await respondToInvitation({
    document: resolved.document,
    user: input.user,
    organizationName: resolved.organizationName,
    accept: false,
  });
}
