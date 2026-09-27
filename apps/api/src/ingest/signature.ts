import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * GitHub webhook signature verification.
 *
 * The HMAC is computed over the **raw request bytes**. Re-serializing the
 * parsed JSON would change the bytes (key order, whitespace) and the digest
 * would never match, so the webhook route must read the body with
 * `express.raw()` and hand the Buffer here untouched.
 */

export const SIGNATURE_HEADER = "x-hub-signature-256";
const PREFIX = "sha256=";

export class SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureError";
  }
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string | undefined,
): void {
  if (!secret) {
    // Fail closed. An unconfigured secret must never mean "accept everything".
    throw new SignatureError("GITHUB_WEBHOOK_SECRET is not set");
  }

  if (!signatureHeader) {
    throw new SignatureError("Missing X-Hub-Signature-256 header");
  }

  if (!signatureHeader.startsWith(PREFIX)) {
    throw new SignatureError("Signature is not sha256");
  }

  const provided = Buffer.from(signatureHeader.slice(PREFIX.length), "hex");

  if (provided.length !== 32) {
    throw new SignatureError("Signature is not a 32-byte digest");
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest();

  // Equal length is guaranteed by the check above, so this cannot throw.
  if (!timingSafeEqual(provided, expected)) {
    throw new SignatureError("Signature mismatch");
  }
}
