import { headers } from "next/headers";
import { InvitationLanding } from "@/components/invitation-landing";
import { auth } from "@/lib/auth";

/**
 * `/invite/[token]` — the landing page for an organization invitation.
 *
 * There is no server-side accept here on purpose. Accepting adds the caller to
 * an organization, which is a mutation and a privilege grant, so it has to be a
 * `POST` from a session-gated, same-origin endpoint
 * (`/api/invitations/[token]/accept`). Accepting during a server render would
 * also mean a link scanner or crawler hitting the URL could join an
 * organization.
 *
 * The session *is* read here, but only to render the right call to action: a
 * signed-out visitor gets "sign in to accept", and a signed-in visitor on the
 * wrong address is warned before they click a button that would fail. The
 * authoritative check is still the email match inside `acceptInvitation`.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, headerList] = await Promise.all([params, headers()]);
  const session = await auth.api.getSession({ headers: headerList });

  return (
    <InvitationLanding
      token={token}
      signedInEmail={session?.user.email ?? null}
    />
  );
}
