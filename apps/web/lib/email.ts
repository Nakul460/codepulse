import nodemailer, { type Transporter } from "nodemailer";

const smtpPort = Number(process.env.SMTP_PORT);
const hasSmtpCredentials = Boolean(
  process.env.SMTP_USER && process.env.SMTP_PASSWORD,
);
const hasPartialSmtpCredentials = Boolean(
  process.env.SMTP_USER || process.env.SMTP_PASSWORD,
) && !hasSmtpCredentials;

/**
 * Whether verification emails can actually be delivered.
 *
 * Both the sign-in requirement and the member-add check key off this single
 * flag, so the two can never disagree. When it is false the verification
 * requirement is not enforced — otherwise nobody could ever verify and
 * member management would be unusable — and the account-takeover risk stays
 * live, so it is logged loudly rather than silently ignored.
 *
 * The sender, SMTP host, and a valid port are required. Authentication is
 * optional because local relays commonly do not require it, but a username
 * and password must be provided together. The flag has to describe whether a
 * message can actually leave the process; keying it on `EMAIL_FROM` alone
 * would enforce verification even when delivery cannot work.
 */
export const emailVerificationAvailable = Boolean(
  process.env.EMAIL_FROM &&
    process.env.SMTP_HOST &&
    Number.isInteger(smtpPort) &&
    smtpPort > 0 &&
    smtpPort <= 65535 &&
    !hasPartialSmtpCredentials,
);

// Built on first use rather than at import time, so importing this module from
// a migration or build step does not initialize a network transport.
let client: Transporter | null = null;

function getClient() {
  if (!client) {
    const host = process.env.SMTP_HOST;

    if (!host || !emailVerificationAvailable) {
      throw new Error("SMTP configuration is incomplete");
    }

    client = nodemailer.createTransport({
      host,
      port: smtpPort,
      // Port 465 uses implicit TLS. Other ports use STARTTLS when the server
      // advertises it unless SMTP_SECURE explicitly opts into implicit TLS.
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : smtpPort === 465,
      auth: hasSmtpCredentials
        ? {
            user: process.env.SMTP_USER as string,
            pass: process.env.SMTP_PASSWORD as string,
          }
        : undefined,
    });
  }

  return client;
}

interface emailType {
  to: string;
  text: string;
  subject?: string;
}

export async function sendEmail({ to, text, subject }: emailType) {
  const from = process.env.EMAIL_FROM;

  if (!from || !emailVerificationAvailable) {
    console.error(
      "[email] SMTP is not configured; refusing to send. Email for",
      to,
      "cannot be delivered.",
    );
    return;
  }

  try {
    await getClient().sendMail({
      from,
      to,
      subject: subject ?? "Reset your CodePulse password",
      text,
    });
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
