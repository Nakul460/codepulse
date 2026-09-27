/**
 * Sanitises a post-sign-in redirect target.
 *
 * The `next` parameter arrives from the URL, so it is attacker-controlled and
 * gets used as a navigation destination. Anything that is not a plain
 * same-site path is discarded and the caller falls back to the default, because
 * a redirect to another origin after login is an open redirect — it is exactly
 * the shape used to turn a real login page into a convincing phishing flow.
 *
 * Rejected:
 *   - absolute URLs (`https://evil.example`)
 *   - protocol-relative URLs (`//evil.example`, which keep the current scheme
 *     and so are easy to miss with a naive check)
 *   - backslash forms (`/\evil.example`), which several browsers normalise to
 *     `//evil.example`
 *   - control characters and whitespace, which can be used to smuggle either of
 *     the above past a prefix test
 *
 * Allowed: a single leading `/` followed by ordinary path characters.
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  if (/[\u0000-\u0020\u007f]/.test(value)) {
    return fallback;
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }

  // The root is safe but is never the destination anyone meant to ask for.
  if (value === "/") {
    return fallback;
  }

  return value;
}
