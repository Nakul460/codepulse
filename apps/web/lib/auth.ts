import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, lastLoginMethod } from "better-auth/plugins";
import { emailVerificationAvailable, sendEmail } from "./email";
import { getAuthDb } from "./mongo";
import { assertPasswordStrength, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-policy";
import {
  getEnabledSocialProviders,
  PROVIDER_CREDENTIALS,
} from "./social-providers";

const db = getAuthDb();

// Requiring verification is only meaningful if a verification email can
// actually be delivered, so this is the single source of truth shared with
// the member-add check. See lib/email.ts.
const canDeliverEmail = emailVerificationAvailable;

const isProduction = process.env.NODE_ENV === "production";

/**
 * `next build` sets NODE_ENV=production while running module code to collect
 * page data (build/index.js:1212 also sets NEXT_PHASE). A guard that throws on
 * a missing EMAIL_FROM would therefore fail the build, which is exactly the
 * wrong moment to enforce a runtime deployment requirement — and it would make
 * `EMAIL_FROM` a build input, so a deploy pipeline without the production secret
 * could never even build the image. Skipping the check during the build phase
 * keeps it a deployment check, which is what it actually is.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!canDeliverEmail) {
  // In production this is a takeover hole, not a convenience gap: an
  // unverified signup claims an email address, and when an admin later adds
  // that address to an organization the membership row is written for the
  // *attacker's* account, handing them org-admin rights. Failing closed at
  // startup is deliberate — discovering this from an incident is far worse than
  // discovering it from a failed deploy. Local dev and `next build` keep the
  // permissive behaviour so the app stays usable without a mail provider.
  if (isProduction && !isBuildPhase) {
    throw new Error(
      "EMAIL_FROM and RESEND_API_KEY must be set in production. Without them " +
        "better-auth cannot deliver verification or password-reset email, so " +
        "signups would " +
        "be unverified and a registrant could claim another person's address. " +
        "Set both EMAIL_FROM and RESEND_API_KEY.",
    );
  }

  console.warn(
    "[auth] EMAIL_FROM or RESEND_API_KEY is not set — email verification is " +
      "NOT enforced. Anyone can register an account using someone else's " +
      "address and receive access if it is ever added to an organization.",
  );
}

// Google is optional. better-auth drops a provider whose config is null or
// `enabled: false` (dist/context/create-context.mjs:98-106), so registering it
// conditionally means an unconfigured deployment 404s on /callback/google
// instead of failing mid-OAuth. A non-null config with a missing clientId
// would only log a warning and then break during the handshake.
// The enabled set is decided once, in lib/social-providers.ts, and reused here
// so registration and the sign-in UI can never disagree. Registering a
// credential-less provider is not a safe no-op: better-auth registers it anyway
// and the failure surfaces mid-handshake as an opaque OAuth error.
const enabledSocialProviders = getEnabledSocialProviders();

const socialProviders = Object.fromEntries(
  enabledSocialProviders.map((id) => [
    id,
    {
      clientId: PROVIDER_CREDENTIALS[id].clientId as string,
      clientSecret: PROVIDER_CREDENTIALS[id].clientSecret as string,
    },
  ]),
);

export const auth = betterAuth({
  database: mongodbAdapter(db),
  // Reset links are built from this, so it must not be pinned to localhost.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000/",
  appName: "CodePulse",

  advanced: {
    // better-auth's documented default for this is `false`, but the runtime
    // actually derives it from the resolved protocol (dist/cookies/index.mjs
    // :23-28). Being explicit means a misconfigured proxy that reports `http`
    // in production cannot silently downgrade the session cookie to a
    // plaintext one.
    useSecureCookies: isProduction,
    // The session cookie is the only thing standing between a leaked cookie and
    // a full account, so state the attributes rather than relying on defaults.
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
    // Behind Vercel/any proxy the request IP has to be read from a forwarded
    // header, otherwise every visitor shares one rate-limit bucket and one
    // `no-trusted-ip` bucket.
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },

  session: {
    // better-auth has no refresh token and never rotates the session token —
    // the refresh path only pushes `expiresAt` forward (dist/api/routes/session
    // .mjs:198-221). A stolen cookie therefore stays valid until absolute
    // expiry, and each use renews it. Seven days is the ceiling on how long one
    // stolen cookie can be replayed.
    expiresIn: 60 * 60 * 24 * 7,
    // Sliding refresh: only rewrite the session row once a day, so ordinary
    // browsing does not write to the database on every request.
    updateAge: 60 * 60 * 24,
    // Sensitive operations (listing/revoking sessions, changing the password,
    // deleting the account) additionally require a session created within this
    // window, which is the re-authentication prompt that stands in for the
    // "rotate on suspicious use" a refresh token would give us.
    freshAge: 60 * 60 * 12,
  },

  account: {
    accountLinking: {
      // github verifies emails, so a GitHub sign-in may attach to an existing
      // local account. `allowDifferentEmails` stays false: linking a GitHub
      // identity that reports a different address would hand that account to
      // the GitHub user.
      trustedProviders: ["github"],
      allowDifferentEmails: false,
      // Leave the local profile alone when linking. Copying provider data over
      // a user's own name/image is surprising, and email/emailVerified are
      // never touched regardless.
      updateUserInfoOnLink: false,
    },
    // OAuth access/refresh tokens are stored in the account row. They are
    // bearer credentials for GitHub, so encrypt them at rest.
    encryptOAuthTokens: true,
  },

  emailAndPassword: {
    enabled: true,
    // Without this, anyone can register an account using someone else's
    // address. When an admin later adds that address to an organization the
    // membership row is written for the *attacker's* account, handing them
    // org-admin (and therefore project owner) rights.
    requireEmailVerification: canDeliverEmail,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    // better-auth only checks length (1.7.5 has no character-class options),
    // so the policy is enforced here — inside the one funnel every
    // password-setting route calls — and shared with the forms via
    // lib/password-policy.ts. The length bounds still have to be declared or
    // better-auth's own check would disagree with ours.
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    password: {
      hash: async (password) => {
        assertPasswordStrength(password);
        return hashPassword(password);
      },
    },
    sendResetPassword: async ({ user, url }) => {
      // Awaited: a fire-and-forget send can be frozen out when the runtime
      // tears the invocation down, silently losing the reset email.
      await sendEmail({
        to: user.email,
        subject: "Reset your CodePulse password",
        text: `Click the link to reset your password: ${url}`,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your CodePulse email",
        text: `Confirm your email address to finish signing up: ${url}`,
      });
    },
  },

  rateLimit: {
    // better-auth's own default is "production only"; enabling it explicitly
    // means local development is throttled the same way, so a rate-limit
    // regression shows up on a laptop instead of after a deploy.
    enabled: true,
    window: 60,
    max: 50,
    storage: "database",
    customRules: {
      // Keys are better-auth-relative, matched exactly after the base path is
      // stripped (dist/rate-limiter/index.mjs:235-262) — so no `/api/auth`
      // prefix, or the rule is silently ignored.
      "sign-in/email": { window: 60, max: 10 },
      "sign-up/email": { window: 60, max: 5 },
      "request-password-reset": { window: 60, max: 3 },
      "send-verification-email": { window: 60, max: 3 },
      "change-password": { window: 300, max: 5 },
      "delete-user": { window: 300, max: 3 },
    },
  },

  socialProviders,

  plugins: [
    // Rejects passwords found in a breach corpus. It wraps the same
    // `password.hash` funnel as the policy above, and only the first five hex
    // characters of a SHA-1 leave the process (k-anonymity).
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "That password has appeared in a known data breach. Choose another one.",
    }),
    // Records how this user last signed in ("email", "github", …) so the
    // account page can show it and flag an unexpected change. Must be imported
    // from the barrel: there is no `better-auth/plugins/last-login-method`
    // subpath export, and a deep import fails to resolve types.
    lastLoginMethod({ storeInDatabase: true }),
    // Makes Set-Cookie work when *our* route handlers call a mutating
    // `auth.api` method (change-password, delete-user, sign-out). Next drops
    // the response headers those calls produce, which would leave a deleted
    // account's session cookie in the browser. `toNextJsHandler` does not do
    // this — the plugin has to be registered here.
    nextCookies(),
  ],

  user: {
    deleteUser: {
      enabled: true,
      // better-auth deletes the user, sessions and accounts; it knows nothing
      // about CodePulse's own data, so afterDelete releases organizations,
      // projects, tokens and the GitHub installation. See lib/account-deletion.
      afterDelete: async (user) => {
        const { deleteUserOwnedData } = await import("./account-deletion");
        await deleteUserOwnedData(user.id);
      },
    },
  },
});
