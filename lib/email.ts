import { Resend } from "resend";

/**
 * Whether verification emails can actually be delivered.
 *
 * Both the sign-in requirement and the member-add check key off this single
 * flag, so the two can never disagree. When it is false the verification
 * requirement is not enforced — otherwise nobody could ever verify and
 * member management would be unusable — and the account-takeover risk stays
 * live, so it is logged loudly rather than silently ignored.
 */
export const emailVerificationAvailable = Boolean(process.env.EMAIL_FROM);

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
