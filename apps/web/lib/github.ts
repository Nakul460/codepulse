/**
 * GitHub App plumbing: App authentication, installation access tokens, and the
 * signed `state` that carries intent across the install redirect.
 *
 * Nothing here is cached across a cold start except installation tokens, which
 * live on `globalThis` so dev hot-reload does not re-mint one per edit.
 *
 * Not to be confused with the `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` pair
 * in `.env`: those are better-auth's social-login credentials. The App is a
 * separate identity with its own id, slug and private key.
 */

import { createHmac, createSign, timingSafeEqual } from "node:crypto";

const API_ROOT = "https://api.github.com";
const APP_MAX_LIFETIME_SECONDS = 540; // GitHub rejects exp more than 10 min out.
const CLOCK_SKEW_SECONDS = 60;
// Renew this far ahead of the real expiry so a token cannot lapse mid-request.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const INSTALL_STATE_TTL_MS = 10 * 60 * 1000;

export class GitHubError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

interface AppConfig {
  appId: string;
  slug: string;
  /** PEM with real newlines, however the environment happens to store it. */
  privateKey: string;
}

function appConfig(): AppConfig {
  const appId = process.env.GITHUB_APP_ID;
  const slug = process.env.GITHUB_APP_SLUG;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !slug || !privateKey) {
    throw new GitHubError(
      "The GitHub App is not configured. Set GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY.",
      503,
    );
  }

  return {
    appId,
    slug,
    // A PEM in a .env file is usually stored with literal \n sequences.
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

export function githubAppConfigured() {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_SLUG &&
      process.env.GITHUB_APP_PRIVATE_KEY,
  );
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

/**
 * RS256 JWT signed with the App private key, authenticating CodePulse *as the
 * App* (not as a user). Hand-built rather than pulled from a JWT library: the
 * payload is three fixed claims we control, so there is no untrusted input
 * reaching the signature.
 */
function createAppJwt() {
  const { appId, privateKey } = appConfig();
  const issuedAt = Math.floor(Date.now() / 1000) - CLOCK_SKEW_SECONDS;

  const signingInput = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(
      JSON.stringify({
        iat: issuedAt,
        exp: issuedAt + APP_MAX_LIFETIME_SECONDS,
        iss: appId,
      }),
    ),
  ].join(".");

  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKey);

  return `${signingInput}.${signature.toString("base64url")}`;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const globalForGithub = globalThis as unknown as {
  githubInstallationTokens?: Map<string, CachedToken>;
};

function tokenCache() {
  globalForGithub.githubInstallationTokens ??= new Map();
  return globalForGithub.githubInstallationTokens;
}

async function githubFetch<T>(
  path: string,
  init: { method?: string; token: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CodePulse",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[github] ${init.method ?? "GET"} ${path} -> ${res.status}`, detail);

    // 401 here almost always means the App was uninstalled or the
    // installation was suspended, which the operator has to fix on GitHub.
    if (res.status === 401) {
      throw new GitHubError(
        "GitHub rejected the App credentials. The App may have been uninstalled or suspended.",
        409,
      );
    }

    if (res.status === 404) {
      throw new GitHubError("That GitHub repository is not available to the App.", 404);
    }

    throw new GitHubError("GitHub request failed.");
  }

  return (await res.json()) as T;
}

/** Mints a fresh installation access token using the App JWT. */
async function mintInstallationToken(installationId: string) {
  const jwt = createAppJwt();
  const payload = await githubFetch<{ token: string; expires_at: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    { method: "POST", token: jwt },
  );

  return {
    token: payload.token,
    expiresAt: new Date(payload.expires_at).getTime(),
  } satisfies CachedToken;
}

/**
 * A usable installation token, reused until shortly before it expires.
 *
 * Cached in memory rather than stored: these expire in an hour, so a
 * persisted copy would be a dead credential sitting in the database.
 */
export async function getInstallationToken(installationId: string) {
  const cache = tokenCache();
  const cached = cache.get(installationId);

  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }

  const minted = await mintInstallationToken(installationId);
  cache.set(installationId, minted);
  return minted.token;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  default_branch: string | null;
  language: string | null;
  html_url: string;
  owner: { login: string };
}

export interface GitHubInstallation {
  id: number;
  account: { login: string; type: "User" | "Organization" };
}

/** The installation itself, authenticated as the App. */
export async function getInstallation(
  installationId: string,
): Promise<GitHubInstallation> {
  return githubFetch<GitHubInstallation>(
    `/app/installations/${encodeURIComponent(installationId)}`,
    { token: createAppJwt() },
  );
}

const REQUIRED_WEBHOOK_EVENTS = ["push", "pull_request", "issues", "create", "delete", "deployment", "deployment_status"];
const REQUIRED_APP_PERMISSIONS = ["contents", "issues", "pull_requests", "deployments"] as const;

function configuredWebhookUrl() {
  const value = process.env.GITHUB_WEBHOOK_URL;
  if (!value) throw new GitHubError("GITHUB_WEBHOOK_URL is not configured", 503);
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new GitHubError("GITHUB_WEBHOOK_URL must be an absolute HTTPS URL", 503); }
  if (parsed.protocol !== "https:") throw new GitHubError("GITHUB_WEBHOOK_URL must use HTTPS", 503);
  return parsed.toString().replace(/\/$/, "");
}

export async function getGithubAppWebhookStatus() {
  const expectedUrl = process.env.GITHUB_WEBHOOK_URL ?? "";
  if (!githubAppConfigured() || !expectedUrl || !process.env.GITHUB_WEBHOOK_SECRET) {
    return { appConfigured: githubAppConfigured(), configured: false, callbackUrl: expectedUrl, appUrl: null, missingEvents: REQUIRED_WEBHOOK_EVENTS, missingPermissions: [...REQUIRED_APP_PERMISSIONS] };
  }
  const normalizedExpectedUrl = configuredWebhookUrl();
  const token = createAppJwt();
  const [hook, app] = await Promise.all([
    githubFetch<{ url?: string; secret?: string }>("/app/hook/config", { token }),
    githubFetch<{ html_url?: string; events?: string[]; permissions?: Record<string, string> }>("/app", { token }),
  ]);
  const events = new Set(app.events ?? []);
  const permissions = app.permissions ?? {};
  return {
    appConfigured: true,
    configured: hook.url === normalizedExpectedUrl && Boolean(hook.secret),
    callbackUrl: normalizedExpectedUrl,
    currentUrl: hook.url ?? null,
    appUrl: app.html_url ?? null,
    missingEvents: REQUIRED_WEBHOOK_EVENTS.filter((event) => !events.has(event)),
    missingPermissions: REQUIRED_APP_PERMISSIONS.filter((permission) => permissions[permission] !== "read" && permissions[permission] !== "write"),
  };
}

/** Set the app-global webhook destination and secret to this server's config. */
export async function configureGithubAppWebhook() {
  const url = configuredWebhookUrl();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new GitHubError("GITHUB_WEBHOOK_SECRET is not configured", 503);
  await githubFetch<{ url: string }>("/app/hook/config", {
    method: "PATCH",
    token: createAppJwt(),
    body: { url, content_type: "json", secret, insecure_ssl: "0" },
  });
  return getGithubAppWebhookStatus();
}

/**
 * Every repository the installation has been granted access to.
 *
 * Paginated: an installation routinely covers more than one page, and
 * truncating would silently drop repositories the user explicitly granted.
 * Bounded so a huge installation cannot loop forever.
 */
export async function listInstallationRepositories(
  installationId: string,
): Promise<GitHubRepository[]> {
  const token = await getInstallationToken(installationId);
  const perPage = 100;
  const maxPages = 10;
  const all: GitHubRepository[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const payload = await githubFetch<{ repositories: GitHubRepository[] }>(
      `/installation/repositories?per_page=${perPage}&page=${page}`,
      { token },
    );

    all.push(...payload.repositories);

    if (payload.repositories.length < perPage) {
      return all;
    }
  }

  console.warn(
    `[github] installation ${installationId} has more than ${maxPages * perPage} repositories; the rest were not attached`,
  );

  return all;
}

export function getInstallationUrl() {
  return `https://github.com/apps/${appConfig().slug}/installations/new`;
}

/**
 * Carries "which org, which user" across GitHub's redirect, signed so neither
 * can be swapped in the URL.
 *
 * This is the CSRF defence for the install flow, and it has to be: the
 * callback is a top-level navigation *from* github.com, so `assertSameOrigin`
 * would (correctly) reject it as cross-site.
 */
export function signInstallState(input: { organizationId: string; userId: string }) {
  const payload = base64url(
    JSON.stringify({
      organizationId: input.organizationId,
      userId: input.userId,
      exp: Date.now() + INSTALL_STATE_TTL_MS,
    }),
  );

  const signature = base64url(
    createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
      .update(payload)
      .digest(),
  );

  return `${payload}.${signature}`;
}

export function verifyInstallState(
  state: string,
): { organizationId: string; userId: string } {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new GitHubError("BETTER_AUTH_SECRET is not set", 503);
  }

  const [payload, signature] = state.split(".");

  if (!payload || !signature) {
    throw new GitHubError("Malformed install state", 400);
  }

  const expected = base64url(
    createHmac("sha256", secret).update(payload).digest(),
  );

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);

  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new GitHubError("Install state failed verification", 400);
  }

  let decoded: { organizationId?: string; userId?: string; exp?: number };

  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new GitHubError("Malformed install state", 400);
  }

  if (!decoded.organizationId || !decoded.userId || !decoded.exp) {
    throw new GitHubError("Malformed install state", 400);
  }

  if (decoded.exp < Date.now()) {
    throw new GitHubError("The install request expired. Start again.", 400);
  }

  return { organizationId: decoded.organizationId, userId: decoded.userId };
}
