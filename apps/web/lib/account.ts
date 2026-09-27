import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { emailVerificationAvailable } from "@/lib/email";
import { NotFoundError, UnauthorizedError } from "@/lib/session";

/**
 * Server-side access to better-auth's session and account state for the
 * signed-in user.
 *
 * The important rule in this file: **a raw session token never leaves the
 * server.** `auth.api.listSessions` returns the session `token` for every
 * session because better-auth's `revokeSession` takes a token as its argument,
 * but sending those values to a browser would hand out the credentials for
 * every logged-in device. Instead the client is given each session's document
 * `id`, and revoking resolves that id back to its token here, after checking
 * the row belongs to the caller.
 */

export interface AccountSummary {
  email: string;
  emailVerified: boolean;
  /** Whether this deployment can verify emails at all; see lib/email.ts. */
  canVerifyEmail: boolean;
  name: string;
  image: string | null;
  /** "email", "github", "google", … — null if never recorded. */
  lastLoginMethod: string | null;
  hasPassword: boolean;
}

export async function getAccountSummary(): Promise<AccountSummary> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new UnauthorizedError();
  }

  const accounts = await auth.api.listUserAccounts({
    headers: await headers(),
  });

  return {
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    canVerifyEmail: emailVerificationAvailable,
    name: session.user.name,
    image: session.user.image ?? null,
    lastLoginMethod: session.user.lastLoginMethod ?? null,
    hasPassword: accounts.some((account) => account.providerId === "credential"),
  };
}

export interface DeviceSession {
  /** The session document id. The only session identifier the client ever sees. */
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** True for the session making this request. */
  isCurrent: boolean;
  /**
   * True when no *other* session of this user has ever shared this IP and
   * browser, i.e. this is the first sign-in we have seen from this device.
   * Computed from the other sessions below — better-auth has no device concept
   * of its own.
   */
  isNewDevice: boolean;
  /** Approximate "last seen" label derived from the stored user agent. */
  deviceLabel: string;
}

/**
 * The caller's sessions, newest first, with tokens stripped.
 *
 * better-auth gates this on `session.freshAge`, so a session older than that
 * gets a 403 `SESSION_NOT_FRESH` and the caller has to re-authenticate. That is
 * the intended behaviour: enumerating every logged-in device is a reauth-worthy
 * action. Callers should surface it as "please sign in again", not as an error.
 */
export async function listDeviceSessions(): Promise<DeviceSession[]> {
  const headerList = await headers();
  const current = await auth.api.getSession({ headers: headerList });
  const sessions = await auth.api.listSessions({ headers: headerList });

  if (!current) {
    throw new UnauthorizedError();
  }

  // A device is "known" if some other session already used the same IP and
  // browser. Missing values on both sides must not count as a match, or every
  // session with no recorded IP would look like a known device.
  //
  // The *current* session's own signature is included deliberately. Excluding it
  // meant that a second session from the device you are sitting at — two tabs,
  // or a session left over from an earlier sign-in on this same browser and IP
  // — was reported as a "new device", which is exactly the alarm the label is
  // supposed to reserve for an unfamiliar one. A device you are using right now
  // is not a new device.
  const knownSignatures = new Set(
    sessions
      .filter((session) => session.ipAddress && session.userAgent)
      .map((session) => deviceSignature(session.ipAddress, session.userAgent)),
  );

  return sessions
    .map((session) => {
      const signature = deviceSignature(session.ipAddress, session.userAgent);
      const isCurrent = session.id === current.session.id;

      return {
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.updatedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        ipAddress: session.ipAddress ?? null,
        userAgent: session.userAgent ?? null,
        isCurrent,
        // A session with no IP or user agent cannot be compared to anything, so
        // it is never labelled new rather than being assumed unfamiliar.
        isNewDevice:
          !isCurrent && Boolean(session.ipAddress && session.userAgent)
            ? !knownSignatures.has(signature)
            : false,
        deviceLabel: describeUserAgent(session.userAgent),
      };
    })
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) {
        return a.isCurrent ? -1 : 1;
      }
      return b.lastSeenAt.localeCompare(a.lastSeenAt);
    });
}

function deviceSignature(
  ipAddress: string | null | undefined,
  userAgent: string | null | undefined,
) {
  return `${ipAddress ?? ""}|${userAgent ?? ""}`;
}

/**
 * Revokes one session by its document id.
 *
 * The id is looked up against the caller's own sessions before being used, so
 * an id belonging to somebody else cannot be revoked and cannot be probed for
 * existence — it is simply not found.
 */
export async function revokeDeviceSessionById(sessionId: string): Promise<void> {
  const headerList = await headers();
  const sessions = await auth.api.listSessions({ headers: headerList });
  const target = sessions.find((session) => session.id === sessionId);

  if (!target) {
    // 404, not 401: the caller *is* authenticated. Reporting "unauthorized"
    // for a session that does not exist sends the UI down a reauthentication
    // path it does not need, and 401 invites cookie-clearing on a request that
    // was never unauthorized. Better-auth gives no way to distinguish "not
    // yours" from "does not exist" here, and returning the same 404 for both is
    // also what stops this endpoint probing for other users' session ids.
    throw new NotFoundError("Session not found");
  }

  await auth.api.revokeSession({
    headers: headerList,
    body: { token: target.token },
  });
}

/** Signs out every device except this one. */
export async function revokeOtherDeviceSessions(): Promise<void> {
  await auth.api.revokeOtherSessions({ headers: await headers() });
}

export interface LinkedAccount {
  providerId: string;
  /** false for the email/password account, which cannot be unlinked. */
  canUnlink: boolean;
  linkedAt: string | null;
}

const UNLINKABLE_PROVIDERS = new Set(["github", "google"]);

/**
 * The accounts this user has connected.
 *
 * Surfaced on the account page because account linking is invisible otherwise:
 * a GitHub sign-in silently attaches to an existing local account when the
 * addresses match and that account is already verified, and the user has no way
 * to see or undo that.
 */
export async function listLinkedAccounts(): Promise<LinkedAccount[]> {
  const headerList = await headers();
  const session = await auth.api.getSession({ headers: headerList });

  if (!session) {
    throw new UnauthorizedError();
  }

  const accounts = await auth.api.listUserAccounts({ headers: headerList });

  return accounts.map((account) => ({
    providerId: account.providerId,
    // better-auth refuses to unlink the last credential account, and a user
    // with only OAuth would lock themselves out. Say so in the UI rather than
    // offering a button that will 400.
    canUnlink: UNLINKABLE_PROVIDERS.has(account.providerId),
    linkedAt: account.createdAt ? new Date(account.createdAt).toISOString() : null,
  }));
}

export async function unlinkProviderAccount(providerId: string): Promise<void> {
  if (!UNLINKABLE_PROVIDERS.has(providerId)) {
    throw new UnauthorizedError("That account cannot be unlinked");
  }

  const headerList = await headers();
  const session = await auth.api.getSession({ headers: headerList });

  if (!session) {
    throw new UnauthorizedError();
  }

  // `unlinkAccount` takes the provider's own account id (GitHub's numeric user
  // id, Google's subject), not the provider name, so it has to be looked up.
  const accounts = await auth.api.listUserAccounts({ headers: headerList });
  const account = accounts.find((entry) => entry.providerId === providerId);

  if (!account) {
    throw new UnauthorizedError("That account is not connected");
  }

  await auth.api.unlinkAccount({
    headers: headerList,
    body: { accountId: account.accountId },
  });
}

/** A rough, human-readable device name. Deliberately not a UA parser. */
function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return "Unknown device";
  }

  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/") || ua.includes("crios/")
      ? "Chrome"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("safari/") && !ua.includes("chrome/")
          ? "Safari"
          : "Browser";

  const platform = ua.includes("android")
    ? "Android"
    : ua.includes("iphone") || ua.includes("ipad")
      ? "iOS"
      : ua.includes("mac os")
        ? "macOS"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("linux")
            ? "Linux"
            : "Unknown OS";

  return `${browser} on ${platform}`;
}
