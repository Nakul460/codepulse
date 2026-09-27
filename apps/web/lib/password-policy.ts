/**
 * The password policy, in one place.
 *
 * better-auth 1.7.5 only validates `minPasswordLength` / `maxPasswordLength` —
 * it has no `minNumbers` / `minUppercaseChars` / `minSymbols` options, so
 * character-class rules have to be enforced by us. The single funnel for every
 * password better-auth sets is `emailAndPassword.password.hash` (sign-up,
 * change-password, reset-password, and the admin/OTP variants all call it), so
 * the policy is enforced there, once, and cannot be bypassed by using a
 * different entry point.
 *
 * The same rules are exported for the forms so the browser can show the user
 * what is wrong before the round trip. Keep the two in sync by importing
 * `PASSWORD_REQUIREMENTS` rather than restating the rules.
 */

export const PASSWORD_MIN_LENGTH = 12;

/** Matches better-auth's own ceiling, so a long-but-valid password is not rejected twice. */
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRequirement {
  id: string;
  /** Shown to the user as a checklist item. */
  label: string;
  test: (password: string) => boolean;
}

/**
 * A short, deterministic denylist. This is not a substitute for a breach
 * database — `haveIBeenPwned` does that — it just stops a password that is
 * trivially guessable from passing the complexity rules.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwerty",
  "qwerty123",
  "123456789012",
  "1234567890",
  "letmein12345",
  "welcome12345",
  "administrator",
  "iloveyou1234",
  "changeme1234",
  "codepulse1234",
  "p@ssw0rd1234",
]);

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "max-length",
    label: `No more than ${PASSWORD_MAX_LENGTH} characters`,
    test: (password) => password.length <= PASSWORD_MAX_LENGTH,
  },
  {
    id: "lowercase",
    label: "A lowercase letter",
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: "uppercase",
    label: "An uppercase letter",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    label: "A number",
    test: (password) => /[0-9]/.test(password),
  },
  {
    id: "not-common",
    label: "Not an obvious guess",
    test: (password) =>
      !COMMON_PASSWORDS.has(password.toLowerCase()) &&
      // A single repeated character satisfies every character-class rule above
      // while being no harder to guess than a single character.
      !/^(.)\1+$/.test(password),
  },
];

/** The requirements a password fails, in checklist order. Empty means valid. */
export function findPasswordIssues(password: string): string[] {
  return PASSWORD_REQUIREMENTS.filter(
    (requirement) => !requirement.test(password),
  ).map((requirement) => requirement.label);
}

export class PasswordPolicyError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(" "));
    this.name = "PasswordPolicyError";
    this.issues = issues;
  }
}

/**
 * Throws `PasswordPolicyError` if the password does not satisfy the policy.
 *
 * Called from better-auth's `password.hash`, which is why it throws a plain
 * Error: better-auth wraps anything thrown there into the endpoint's error
 * response, and a `PasswordPolicyError` carrying `issues` is what the sign-up
 * and change-password forms read to render the specific failures.
 */
export function assertPasswordStrength(password: string): void {
  const issues = findPasswordIssues(password);

  if (issues.length > 0) {
    throw new PasswordPolicyError(issues);
  }
}
