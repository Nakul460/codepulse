import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { emailVerificationAvailable, sendEmail } from "./email";
import { getAuthDb } from "./mongo";

const db = getAuthDb();

// Requiring verification is only meaningful if a verification email can
// actually be delivered, so this is the single source of truth shared with the
// member-add check. See lib/email.ts.
const canDeliverEmail = emailVerificationAvailable;

if (!canDeliverEmail) {
  console.warn(
    "[auth] EMAIL_FROM is not set — email verification is NOT enforced. " +
      "Anyone can register an account using someone else's address and " +
      "receive access if it is ever added to an organization.",
  );
}

export const auth = betterAuth({
  database: mongodbAdapter(db),
  // Reset links are built from this, so it must not be pinned to localhost.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000/",
  account: {
    accountLinking: {
      trustedProviders: ["github"],
    },
  },
  emailAndPassword: {
    enabled: true,
    // Without this, anyone can register an account using someone else's
    // address. When an admin later adds that address to an organization the
    // membership row is written for the *attacker's* account, handing them
    // org-admin (and therefore project owner) rights.
    requireEmailVerification: canDeliverEmail,
    revokeSessionsOnPasswordReset: true,
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
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your CodePulse email",
        text: `Confirm your email address to finish signing up: ${url}`,
      });
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 50,
    storage: "database",
    customRules: {
      // Must match better-auth's real path (matched exactly, after the base
      // path is stripped) or the rule is silently ignored. The old
      // "/request-new-password" key never matched anything.
      "/request-password-reset": {
        window: 60,
        max: 1,
      },
    },
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
});
