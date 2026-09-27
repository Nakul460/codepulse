"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActivityIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  acceptInvitation,
  declineInvitation,
  previewInvitation,
  type InvitationPreview,
} from "@/lib/api";
import { ORG_ROLE_LABELS } from "@/lib/project-status";

type State =
  | { kind: "loading" }
  | { kind: "ready"; invitation: InvitationPreview }
  | { kind: "error"; message: string };

/**
 * The invitation landing page, at `/invite/<token>`.
 *
 * Reached from the link in the invitation email. The token is in the URL, so
 * three things follow from that:
 *
 *  - It is never sent to the server on load beyond the preview call, and the
 *    preview response deliberately contains no more than the email already
 *    disclosed (org name, role, inviter).
 *  - Accepting is a `POST` behind `assertSameOrigin`, so a cross-site page
 *    cannot trigger it even if the link leaks through a referrer header.
 *  - The route is **not** a server component that could be statically
 *    prerendered with a baked-in decision — the decision is made by the signed
 *    in user, in the browser, on a session-gated endpoint.
 */
export function InvitationLanding({
  token,
  signedInEmail,
}: {
  token: string;
  signedInEmail: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    previewInvitation(token, controller.signal)
      .then(({ invitation }) => setState({ kind: "ready", invitation }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "This invitation is not valid.",
        });
      });

    return () => controller.abort();
  }, [token]);

  async function run(action: "accept" | "decline") {
    setPending(action);
    try {
      if (action === "accept") {
        const { organizationId, organizationName } = await acceptInvitation(token);
        toast.add({
          type: "success",
          description: `You joined ${organizationName}.`,
        });
        // Switch to the new organization so the join is visible immediately.
        router.push(`/dashboard?org=${encodeURIComponent(organizationId)}`);
        router.refresh();
        return;
      }

      await declineInvitation(token);
      toast.add({ type: "success", description: "Invitation declined." });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : action === "accept"
              ? "Could not accept the invitation"
              : "Could not decline the invitation",
      });
    } finally {
      setPending(null);
    }
  }

  const inactive =
    state.kind === "ready" && state.invitation.status !== "pending";

  // Compared case-insensitively because the address is normalised on write, but
  // the provider that supplied it is not guaranteed to have been.
  const addressMismatch =
    state.kind === "ready" &&
    signedInEmail !== null &&
    signedInEmail.toLowerCase() !== state.invitation.email.toLowerCase();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 self-center font-medium hover:underline underline-offset-4"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ActivityIcon className="size-4" aria-hidden="true" />
          </span>
          CodePulse
        </Link>

        <main id="main-content" className="flex flex-col gap-4">
          {state.kind === "loading" ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ) : state.kind === "error" ? (
            <Card>
              <CardHeader>
                <CardTitle>Invitation not valid</CardTitle>
                <CardDescription>{state.message}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button render={<Link href="/dashboard" />}>Go to dashboard</Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>
                  Join {state.invitation.organizationName}
                </CardTitle>
                <CardDescription>
                  {state.invitation.invitedByName} invited you to collaborate on
                  CodePulse as a {ORG_ROLE_LABELS[state.invitation.role]}.
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-[7rem_1fr]">
                  <dt className="text-muted-foreground">Organization</dt>
                  <dd>{state.invitation.organizationName}</dd>
                  <dt className="text-muted-foreground">Your role</dt>
                  <dd>{ORG_ROLE_LABELS[state.invitation.role]}</dd>
                </dl>

                {inactive ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <TriangleAlertIcon
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      {state.invitation.status === "accepted"
                        ? "This invitation has already been accepted."
                        : state.invitation.status === "declined"
                          ? "This invitation was declined."
                          : "This invitation has expired. Ask for a new one."}
                    </span>
                  </div>
                ) : addressMismatch ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <TriangleAlertIcon
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      You are signed in as{" "}
                      <span className="font-medium">{signedInEmail}</span>, but
                      this invitation was sent to{" "}
                      <span className="font-medium">
                        {state.invitation.email}
                      </span>
                      . Accepting will be refused.
                    </span>
                  </div>
                ) : null}

                <Separator />
              </CardContent>

              <CardFooter className="gap-2">
                {inactive ? (
                  <Button render={<Link href="/dashboard" />}>
                    Go to dashboard
                  </Button>
                ) : signedInEmail === null ? (
                  // Send them through sign-in rather than letting them press
                  // Accept and eat a 401, and come back to this same token. No
                  // Decline button here: declining is session-gated too, so it
                  // would fail the same way. Ignoring the email works fine.
                  <Button
                    render={
                      <Link
                        href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                      />
                    }
                  >
                    Sign in to accept
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={pending !== null}
                      onClick={() => void run("accept")}
                    >
                      {pending === "accept" ? "Joining…" : "Accept invitation"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={pending !== null}
                      onClick={() => void run("decline")}
                    >
                      {pending === "decline" ? "Declining…" : "Decline"}
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
