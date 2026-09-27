import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// UX-level redirect only. getSessionCookie just reads the cookie value and
// does not verify the signature, so this is NOT an auth check — the dashboard
// layout validates the session server-side before rendering anything.
export default function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (request.nextUrl.pathname === "/" && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
