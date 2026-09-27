import type { NextConfig } from "next";

/**
 * The web app lives in apps/web, but there is still exactly one .env, at the
 * repo root, shared with the API service and the worker.
 *
 * Next loads .env from its own project root and has no `envDir` option. The
 * package scripts therefore launch it through scripts/next-with-root-env.mjs,
 * which loads the shared file before Next creates any worker processes.
 */
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
