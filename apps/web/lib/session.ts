import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export class UnauthorizedError extends Error {
  constructor(message = "You must be signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this project") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;

  if (!user?.id) {
    throw new UnauthorizedError();
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    image: user.image ?? null,
  };
}

export function toErrorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return { status: 401, message: error.message };
  }

  if (error instanceof ForbiddenError) {
    return { status: 403, message: error.message };
  }

  if (error instanceof NotFoundError) {
    return { status: 404, message: error.message };
  }

  return { status: 500, message: "Something went wrong" };
}

/**
 * Second line of defence against CSRF for mutating requests.
 *
 * Today the session cookie is SameSite=Lax, which already blocks cross-site
 * POST/PATCH/DELETE. This guard means that if SameSite is ever relaxed to
 * "none" (a routine change for a cross-origin frontend) these routes do not
 * silently become CSRF-exploitable.
 *
 * `Sec-Fetch-Site` is set by the browser and cannot be forged by page script,
 * so it is checked first. Requests carrying neither header are non-browser
 * clients (curl, server-to-server), which cannot be CSRF vectors.
 */
export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    throw new ForbiddenError("Cross-site request rejected");
  }

  const origin = request.headers.get("origin");

  if (origin && origin !== "null") {
    const expected = new URL(request.url).origin;

    if (origin !== expected) {
      throw new ForbiddenError("Cross-site request rejected");
    }
  }
}
