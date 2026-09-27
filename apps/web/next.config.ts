import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * The web app lives in apps/web, but there is still exactly one .env, at the
 * repo root, shared with the API service and the worker.
 *
 * Next loads .env from its own project root, which is now apps/web. There is no
 * `envDir` option in Next 16, so the root .env is loaded here instead — this
 * file is evaluated in a Node context before the build starts, so anything it
 * puts on `process.env` is visible to the app. Values already in the
 * environment win, so a real deployment's configuration is never overridden.
 */
const repoRoot = path.join(import.meta.dirname, "../..");
const rootEnv = path.join(repoRoot, ".env");

if (existsSync(rootEnv) && process.loadEnvFile) {
  process.loadEnvFile(rootEnv);
}

const apiTarget = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // The browser only ever talks to this origin. /api/ingest is proxied to the
  // Express service, which keeps the session cookie SameSite=Lax and avoids
  // cross-origin credential handling entirely. This is why the webhook
  // receiver needs no CORS configuration in production.
  async rewrites() {
    return [
      {
        source: "/api/ingest/:path*",
        destination: `${apiTarget}/api/ingest/:path*`,
      },
    ];
  },
};

export default nextConfig;
