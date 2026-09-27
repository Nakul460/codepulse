import { createAuthClient } from "better-auth/react";
import { lastLoginMethodClient } from "better-auth/client/plugins";

/**
 * Browser-side better-auth client.
 *
 * `lastLoginMethodClient` is what lets the sign-in form pre-select the method
 * this person last used. Its cookie is deliberately **not** `httpOnly` so the
 * browser can read it, which is why it is not a security boundary — it is a
 * convenience that puts the right button first.
 *
 * Both `lastLoginMethodClient` and the server plugin must be registered with the
 * same options, or the cookie name the client reads will not match the one the
 * server wrote.
 */
export const authClient = createAuthClient({
  plugins: [lastLoginMethodClient()],
});

/** Human labels for the provider ids better-auth stores. */
export const PROVIDER_LABELS: Record<string, string> = {
  credential: "Email and password",
  github: "GitHub",
  google: "Google",
};
