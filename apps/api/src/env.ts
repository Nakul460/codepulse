/**
 * Loads the repo-root `.env` for processes that are not Next.js.
 *
 * The web app gets this for free; the API service and the worker run under
 * plain node/tsx and would otherwise see an empty environment. Same approach as
 * apps/web/scripts/migrate-to-orgs.ts.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// src/ -> apps/api/ -> apps/ -> repo root
export const repoRoot = resolve(here, "../../..");

export function loadRootEnv() {
  const envPath = join(repoRoot, ".env");

  if (!existsSync(envPath)) {
    return false;
  }

  // Values already in the environment win: in production the platform supplies
  // them, and a stale checked-out .env must not override real configuration.
  if (process.loadEnvFile) {
    process.loadEnvFile(envPath);
  }

  return true;
}

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}
