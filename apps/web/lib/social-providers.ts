/**
 * Which OAuth providers this deployment can actually use.
 *
 * ## Why this is a list and not a boolean per provider
 *
 * `lib/auth.ts` registers a social provider only when both its client id and
 * secret are present, because better-auth registers any provider object it is
 * given and a credential-less one fails *mid-handshake* with an opaque error
 * rather than being rejected up front. The UI has to show the same set, and it
 * cannot read the env vars itself (`GITHUB_CLIENT_ID` is not `NEXT_PUBLIC_`).
 *
 * So this module is the single source of truth: `lib/auth.ts` registers from
 * `ENABLED_SOCIAL_PROVIDERS`, and the server components that render the
 * sign-in/sign-up forms pass the same list down as a prop. Both sides derive
 * from the same expression, so a button can never appear for a provider that is
 * not wired up.
 */
export const SOCIAL_PROVIDER_IDS = ["github", "google"] as const;

export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];

/**
 * Exported so `lib/auth.ts` registers providers from these same values — the
 * UI and the server must agree on which providers exist.
 */
export const PROVIDER_CREDENTIALS: Record<
  SocialProviderId,
  { clientId?: string; clientSecret?: string }
> = {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
};

/** The providers a user can actually sign in with right now. */
export function getEnabledSocialProviders(): SocialProviderId[] {
  return SOCIAL_PROVIDER_IDS.filter((id) => {
    const { clientId, clientSecret } = PROVIDER_CREDENTIALS[id];
    return Boolean(clientId && clientSecret);
  });
}


