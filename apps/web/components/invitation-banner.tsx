"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailIcon, TriangleAlertIcon } from "lucide-react";
import { useOrganizations } from "@/components/organization-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  acceptInvitation,
  declineInvitation,
  listMyInvitations,
  type OrgInvitationRecord,
} from "@/lib/api";

/**
 * Pending organization invitations, shown above the dashboard.
 *
 * Accepting happens inline here, by invitation id rather than by the emailed
 * token: the token only exists in the email, because the server stores just its
 * hash, so there is nothing here to deep-link to. The session for a verified
 * address is the same proof the emailed token carries, and the server re-checks
 * the address on every call, so this is not a weaker path than the link.
 *
 * Accepting refreshes the organization list rather than just dismissing the
 * banner, otherwise the new organization would not appear in the switcher until
 * a full reload — the most confusing possible outcome for someone who just
 * joined a team.
 */
export function InvitationBanner() {
  const router = useRouter();
  const { refresh } = useOrganizations();

  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; invitations: OrgInvitationRecord[] }
  >({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    listMyInvitations(controller.signal)
      .then(({ invitations }) => setState({ kind: "ready", invitations }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        // A failure here must not block the dashboard. Staying in "loading"
        // would hide the projects list's own state handling, so settle as ready
        // with nothing to show.
        setState({ kind: "ready", invitations: [] });
        if (error instanceof Error) {
          console.warn("could not load invitations:", error.message);
        }
      });

    return () => controller.abort();
  }, []);

  const dismiss = useCallback((invitationId: string) => {
    setState((current) =>
      current.kind === "ready"
        ? {
            kind: "ready",
            invitations: current.invitations.filter(
              (invitation) => invitation.id !== invitationId,
            ),
          }
        : current,
    );
  }, []);

  async function handleAccept(invitation: OrgInvitationRecord) {
    setPendingId(invitation.id);
    try {
      const { organizationId, organizationName } = await acceptInvitation(
        invitation.id,
      );
      dismiss(invitation.id);
      toast.add({
        type: "success",
        description: `You joined ${organizationName}.`,
      });

      // Make the new organization selectable without a reload, and switch to it
      // so the effect of accepting is visible straight away.
      await refresh();
      router.push(`/dashboard?org=${encodeURIComponent(organizationId)}`);
      router.refresh();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Could not accept the invitation",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleDecline(invitation: OrgInvitationRecord) {
    setPendingId(invitation.id);
    try {
      await declineInvitation(invitation.id);
      dismiss(invitation.id);
      toast.add({ type: "success", description: "Invitation declined." });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Could not decline the invitation",
      });
    } finally {
      setPendingId(null);
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-64" />
      </div>
    );
  }

  if (state.invitations.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Pending organization invitations"
      className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
    >
      <div className="flex items-start gap-2">
        <TriangleAlertIcon
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium">
            {state.invitations.length === 1
              ? "You have a pending invitation"
              : `You have ${state.invitations.length} pending invitations`}
          </h2>
          <p className="text-xs text-muted-foreground">
            Accepting adds you to the organization as a member.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {state.invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background/60 p-3 text-sm"
          >
            <MailIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                {invitation.organizationName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Invited by {invitation.invitedByName}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                disabled={pendingId === invitation.id}
                onClick={() => void handleAccept(invitation)}
              >
                {pendingId === invitation.id
                  ? "Working…"
                  : "Accept"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === invitation.id}
                onClick={() => void handleDecline(invitation)}
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
