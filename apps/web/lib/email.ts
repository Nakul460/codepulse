import { Resend } from "resend";

/**
 * Whether verification emails can actually be delivered.
 *
 * Both the sign-in requirement and the member-add check key off this single
 * flag, so the two can never disagree. When it is false the verification
 * requirement is not enforced — otherwise nobody could ever verify and
 * member management would be unusable — and the account-takeover risk stays
 * live, so it is logged loudly rather than silently ignored.
 *
 * **Both** the sender and the API key are required. Keying this on `EMAIL_FROM`
 * alone was a real gap: with a sender configured but no key, the flag said
 * "email works", so verification was enforced and every signup's mail silently
 * failed inside the swallowed `catch` in `sendEmail` — leaving accounts that
 * could never be verified and no error anywhere. The flag has to describe
 * whether a message can actually leave the process.
 */
export const emailVerificationAvailable = Boolean(
  process.env.EMAIL_FROM && process.env.RESEND_API_KEY,
);

// Built on first use rather than at import time, so importing this module
// (e.g. from a migration script) does not require RESEND_API_KEY to be set.
let client: Resend | null = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }

    client = new Resend(apiKey);
  }

  return client;
}

interface emailType {
  to: string;
  text: string;
  subject?: string;
}

export async function sendEmail({ to, text, subject }: emailType) {
  // Resend's onboarding@resend.dev test sender only delivers to the account
  // owner's own address, so a real verified sender must be configured.
  const from = process.env.EMAIL_FROM;

  if (!from) {
    console.error(
      "[email] EMAIL_FROM is not set; refusing to send. Password reset for",
      to,
      "cannot be delivered.",
    );
    return;
  }

  try {
    const { error } = await getClient().emails.send({
      from,
      to,
      subject: subject ?? "Reset your CodePulse password",
      text,
    });

    if (error) {
      console.error(`[email] delivery to ${to} failed:`, error);
    }
  } catch (error) {
    // Deliberately swallowed so a mail outage cannot turn into a 500 on the
    // auth endpoint, but logged with a stable prefix so it is alertable.
    console.error(`[email] delivery to ${to} threw:`, error);
  }
}

/**
 * The public base URL for links in email.
 *
 * `BETTER_AUTH_URL` is the only base URL guaranteed to be correct for the
 * running deployment, and it is already required by better-auth, so it is reused
 * rather than introducing a second one that could disagree. A trailing slash is
 * stripped so `${base}/invite/${token}` never produces a double slash.
 */
function linkBase() {
  return (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
}

/**
 * The organization-invitation email.
 *
 * Text-only, like the password-reset mail: a plain-text link cannot execute,
 * and this is a low-frequency, low-urgency message where an HTML body adds
 * template-quoting surface for no benefit.
 *
 * The token appears **only here**. It is never logged, never returned by any
 * list endpoint, and never recoverable from the database (see
 * `lib/invitations.ts`), so this function is called once per invitation and the
 * link is unrecoverable if the mail is lost — which is why the UI offers a
 * re-send rather than a "copy the link again".
 */
export async function sendInvitationEmail(input: {
  to: string;
  inviterName: string;
  organizationName: string;
  token: string;
  expiresAt: Date;
}) {
  const base = linkBase();

  if (!base) {
    // A missing base would silently produce a useless "/invite/<token>" link,
    // so refuse loudly rather than send something that cannot work.
    console.error(
      "[email] BETTER_AUTH_URL is not set; cannot build an invitation link.",
    );
    return;
  }

  const days = Math.max(
    1,
    Math.round((input.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );

  await sendEmail({
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.organizationName} on CodePulse`,
    text: [
      `${input.inviterName} invited you to join ${input.organizationName} on CodePulse as a member.`,
      "",
      "Accept the invitation:",
      `${base}/invite/${input.token}`,
      "",
      `This link expires in ${days} day${days === 1 ? "" : "s"}. If you were not expecting this, you can ignore this email — no account is created and nothing is granted until you accept.`,
      "",
      "Only the person this was sent to can accept it.",
    ].join("\n"),
  });
}
