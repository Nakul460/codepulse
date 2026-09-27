import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(scriptDirectory, "../../..", ".env");

// The workspace has one shared environment file at the repository root. Load
// it before Next starts so every worker it creates inherits the same values.
// process.loadEnvFile preserves variables already supplied by the deployment.
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

await import("next/dist/bin/next");
