import { createSign } from "node:crypto";

const API_ROOT = "https://api.github.com";
const JWT_LIFETIME_SECONDS = 540;
const CLOCK_SKEW_SECONDS = 60;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

const globalForGithub = globalThis as typeof globalThis & {
  codePulseInstallationTokens?: Map<string, CachedToken>;
};

function appJwt() {
  const appId = process.env.GITHUB_APP_ID;
  const key = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !key) {
    throw new Error("GitHub App credentials are not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iat: now - CLOCK_SKEW_SECONDS,
    exp: now + JWT_LIFETIME_SECONDS,
    iss: appId,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(input)
    .sign(key.replace(/\\n/g, "\n"))
    .toString("base64url");
  return `${input}.${signature}`;
}

async function request<T>(
  path: string,
  token: string,
  method: "GET" | "POST" = "GET",
): Promise<{ data: T; hasNext: boolean }> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CodePulse",
    },
  });

  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(
      `GitHub API returned ${response.status}${retryAfter ? ` (retry after ${retryAfter}s)` : ""}`,
    );
  }

  const link = response.headers.get("link") ?? "";
  return {
    data: (await response.json()) as T,
    hasNext: /rel="next"/.test(link),
  };
}

async function installationToken(installationId: string) {
  const cache = (globalForGithub.codePulseInstallationTokens ??= new Map());
  const cached = cache.get(installationId);
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }

  const { data } = await request<{ token: string; expires_at: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    appJwt(),
    "POST",
  );
  const minted = { token: data.token, expiresAt: new Date(data.expires_at).getTime() };
  cache.set(installationId, minted);
  return minted.token;
}

export async function listRepositoryPages<T>(
  installationId: string,
  fullName: string,
  resource: "commits" | "pulls" | "issues" | "branches" | "deployments",
  query = "",
) {
  const token = await installationToken(installationId);
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo || fullName.split("/").length !== 2) {
    throw new Error("Invalid GitHub repository name");
  }

  const pathBase = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${resource}`;
  const perPage = 100;
  const maxPages = 20;
  const items: T[] = [];
  let truncated = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const suffix = query ? `&${query}` : "";
    const response = await request<T[]>(
      `${pathBase}?per_page=${perPage}&page=${page}${suffix}`,
      token,
    );
    items.push(...response.data);
    if (!response.hasNext) break;
    if (page === maxPages) truncated = true;
  }

  return { items, truncated };
}

export async function listDeploymentStatuses<T>(installationId: string, fullName: string, deploymentId: number) {
  const token = await installationToken(installationId);
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo || fullName.split("/").length !== 2) throw new Error("Invalid GitHub repository name");
  const response = await request<T[]>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/deployments/${deploymentId}/statuses?per_page=1`, token);
  return response.data[0] ?? null;
}
