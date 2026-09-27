"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganizations } from "@/components/organization-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  deleteOrganization,
  inviteOrgMember,
  listOrgInvitations,
  listOrgMembers,
  revokeOrgInvitation,
  removeOrgMember,
  updateOrgMemberRole,
  updateOrganization,
} from "@/lib/api";
import { ORG_ROLE_LABELS } from "@/lib/project-status";
import { ORG_NAME_MAX } from "@/lib/validation";
import {
  Building2Icon,
  MailIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { OrgInvitationRecord } from "@/lib/api";
import type { OrgMemberRecord, OrgRole } from "@/types/project-type";

function SettingsContent() {
  const { activeOrg, activeOrgId, isLoading } = useOrganizations();
  const router = useRouter();

  const [name, setName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [membersState, setMembersState] = useState<{
    orgId: string;
    members: OrgMemberRecord[];
    failed: boolean;
  } | null>(null);
  const [invitationsState, setInvitationsState] = useState<{
    orgId: string;
    invitations: OrgInvitationRecord[];
  } | null>(null);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [memberPendingId, setMemberPendingId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<OrgMemberRecord | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const isAdmin = activeOrg?.role === "admin";

  // The org can change under us (switcher, or a rename elsewhere), so reset
  // the form during render rather than in an effect. Both sides are
  // normalized so the guard matches when there is no org at all.
  const orgName = activeOrg?.name ?? "";
  const [syncedOrgName, setSyncedOrgName] = useState(orgName);
  if (orgName !== syncedOrgName) {
    setSyncedOrgName(orgName);
    setName(orgName);
  }

  // Loading is derived from which org the loaded members belong to, so
  // switching orgs shows the skeleton without an extra state flag.
  const isLoadingMembers =
    isAdmin && (!activeOrgId || membersState?.orgId !== activeOrgId);
  const members =
    membersState?.orgId === activeOrgId ? membersState.members : [];
  const invitations =
    invitationsState?.orgId === activeOrgId ? invitationsState.invitations : [];

  useEffect(() => {
    // Only admins may read the member list, so don't ask for it otherwise.
    if (!activeOrgId || !isAdmin) {
      return;
    }

    const controller = new AbortController();

    listOrgMembers(activeOrgId, controller.signal)
      .then(({ members: loaded }) => {
        setMembersState({ orgId: activeOrgId, members: loaded, failed: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setMembersState({ orgId: activeOrgId, members: [], failed: true });
        toast.add({
          type: "error",
          description:
            error instanceof Error ? error.message : "Could not load members",
        });
      });

    return () => controller.abort();
  }, [activeOrgId, isAdmin]);

  useEffect(() => {
    if (!activeOrgId || !isAdmin) {
      return;
    }

    const controller = new AbortController();

    listOrgInvitations(activeOrgId, controller.signal)
      .then(({ invitations: loaded }) =>
        setInvitationsState({ orgId: activeOrgId, invitations: loaded }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setInvitationsState({ orgId: activeOrgId, invitations: [] });
        toast.add({
          type: "error",
          description:
            error instanceof Error
              ? error.message
              : "Could not load pending invitations",
        });
      });

    return () => controller.abort();
  }, [activeOrgId, isAdmin]);

  async function handleSaveName(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrgId || !name.trim()) {
      return;
    }

    setIsSavingName(true);
    try {
      await updateOrganization(activeOrgId, name.trim());
      toast.add({ type: "success", description: "Organization updated" });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not update organization",
      });
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrgId || !inviteEmail.trim()) {
      return;
    }

    setIsInviting(true);
    try {
      const { invitation } = await inviteOrgMember(activeOrgId, inviteEmail.trim());
      setInvitationsState((previous) =>
        previous?.orgId === activeOrgId
          ? { orgId: activeOrgId, invitations: [invitation, ...previous.invitations] }
          : { orgId: activeOrgId, invitations: [invitation] },
      );
      setIsInviteOpen(false);
      setInviteEmail("");
      toast.add({
        type: "success",
        // Honest about what happened: nothing was added yet. The member appears
        // in the list only once they accept, so saying "Member added" here would
        // be a lie the admin then has to debug.
        description: `Invitation sent to ${invitation.email}. They join once they accept.`,
      });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not send invitation",
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRevokeInvitation(invitationId: string, email: string) {
    if (!activeOrgId) {
      return;
    }

    setRevokingInvitationId(invitationId);
    try {
      await revokeOrgInvitation(activeOrgId, invitationId);
      setInvitationsState((previous) =>
        previous?.orgId === activeOrgId
          ? {
              orgId: activeOrgId,
              invitations: previous.invitations.filter(
                (invitation) => invitation.id !== invitationId,
              ),
            }
          : previous,
      );
      toast.add({ type: "success", description: `Invitation to ${email} revoked.` });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not revoke that invitation",
      });
    } finally {
      setRevokingInvitationId(null);
    }
  }

  const adminCount = members.filter((member) => member.role === "admin").length;

  async function handleRoleChange(userId: string, role: OrgRole) {
    if (!activeOrgId || memberPendingId) {
      return;
    }

    const target = members.find((member) => member.userId === userId);

    // Demoting the last admin would leave the organization with nobody able to
    // manage members or delete it.
    if (target?.role === "admin" && role !== "admin" && adminCount <= 1) {
      toast.add({
        type: "error",
        description:
          "This is the only admin. Promote another member first, or delete the organization.",
      });
      return;
    }

    setMemberPendingId(userId);
    try {
      const { members: updated } = await updateOrgMemberRole(
        activeOrgId,
        userId,
        role,
      );
      setMembersState({ orgId: activeOrgId, members: updated, failed: false });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not update role",
      });
    } finally {
      setMemberPendingId(null);
    }
  }

  async function handleRemove(userId: string) {
    if (!activeOrgId || !pendingRemoval) {
      return;
    }

    setMemberPendingId(userId);
    try {
      const { members: updated } = await removeOrgMember(activeOrgId, userId);
      setMembersState({ orgId: activeOrgId, members: updated, failed: false });
      setPendingRemoval(null);
      toast.add({ type: "success", description: "Member removed" });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not remove member",
      });
    } finally {
      setMemberPendingId(null);
    }
  }

  async function handleDelete() {
    if (!activeOrgId) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteOrganization(activeOrgId);
      toast.add({ type: "success", description: "Organization deleted" });
      setIsDeleteOpen(false);
      router.push("/dashboard");
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not delete organization",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <>
        <SidebarInset id="main-content">
          <div className="flex flex-col gap-6 p-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        </SidebarInset>
      </>
    );
  }

  if (!activeOrg) {
    return (
      <>
        <SidebarInset id="main-content">
          <div className="rounded-xl border p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2Icon />
                </EmptyMedia>
                <EmptyTitle>No organization selected</EmptyTitle>
                <EmptyDescription>
                  Create or select an organization from the sidebar switcher.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </SidebarInset>
      </>
    );
  }

  return (
    <>
      <SidebarInset id="main-content">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <h1 className="font-heading text-lg font-semibold tracking-tight text-balance">
            {activeOrg.name}
          </h1>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <Card>
            <CardHeader>
              <CardTitle>Organization name</CardTitle>
              <CardDescription>
                {isAdmin
                  ? "This is how the organization appears to all of its members."
                  : "Only organization admins can rename it."}
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSaveName}>
              <CardContent>
                <Field className="max-w-md">
                  <FieldLabel htmlFor="org-name">Name</FieldLabel>
                  <Input
                    id="org-name"
                    name="organizationName"
                    autoComplete="organization"
                    maxLength={ORG_NAME_MAX}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={!isAdmin}
                    placeholder="Acme Engineering…"
                  />
                </Field>
              </CardContent>
              {isAdmin && (
                <CardFooter>
                  <Button
                    type="submit"
                    disabled={isSavingName || !name.trim() || name === activeOrg.name}
                  >
                    {isSavingName ? "Saving…" : "Save Changes"}
                  </Button>
                </CardFooter>
              )}
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                Admins manage the organization and own its projects. Members
                can view and edit every project.
              </CardDescription>
              {isAdmin && (
                <CardAction>
                  <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                    <DialogTrigger
                      render={<Button variant="outline" size="sm" />}
                    >
                      <PlusIcon aria-hidden="true" />
                      Invite member
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-sm">
                      <form onSubmit={handleInvite}>
                        <DialogHeader>
                          <DialogTitle>Invite member</DialogTitle>
                          <DialogDescription>
                            We email a one-time link. They join when they accept
                            it.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="my-6">
                          <Field>
                            <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                            <Input
                              id="invite-email"
                              name="email"
                              type="email"
                              inputMode="email"
                              autoComplete="off"
                              spellCheck={false}
                              value={inviteEmail}
                              onChange={(event) => setInviteEmail(event.target.value)}
                              placeholder="person@company.com…"
                            />
                            <FieldDescription>
                              They join as a member. Promote them to admin below
                              if they need to manage the organization. They do
                              not need an account yet — accepting creates one.
                            </FieldDescription>
                          </Field>
                        </div>

                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsInviteOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={isInviting || !inviteEmail.trim()}
                          >
                            {isInviting ? "Sending…" : "Send invitation"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardAction>
              )}
            </CardHeader>

            <CardContent>
              {!isAdmin ? (
                <p className="text-sm text-muted-foreground">
                  Only organization admins can view and manage members.
                </p>
              ) : isLoadingMembers ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="ml-auto h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No members to show.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {members.map((member) => (
                    <li
                      key={member.userId}
                      className="flex flex-wrap items-center gap-3 py-3"
                    >
                      <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {(member.name || member.email)
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {member.name || "Unnamed"}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          translate="no"
                          title={member.email}
                        >
                          {member.email}
                        </p>
                      </div>

                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={member.role}
                            disabled={memberPendingId !== null}
                            onValueChange={(value) =>
                              handleRoleChange(member.userId, value as OrgRole)
                            }
                          >
                            <SelectTrigger
                              className="w-32"
                              aria-label={`Role for ${member.email}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(["admin", "member"] as const).map((role) => (
                                <SelectItem key={role} value={role}>
                                  {ORG_ROLE_LABELS[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${member.email} from ${activeOrg.name}`}
                            disabled={memberPendingId !== null}
                            onClick={() => setPendingRemoval(member)}
                          >
                            <Trash2Icon aria-hidden="true" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {ORG_ROLE_LABELS[member.role]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isAdmin && invitations.length > 0 ? (
                <div className="mt-6 flex flex-col gap-2 border-t pt-4">
                  <h3 className="text-sm font-medium">Pending invitations</h3>
                  <ul className="flex flex-col divide-y">
                    {invitations.map((invitation) => {
                      const { isExpired: expired } = invitation;

                      return (
                        <li
                          key={invitation.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                        >
                          <MailIcon
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="font-medium">{invitation.email}</span>
                          <span
                            className={
                              expired
                                ? "text-xs text-destructive"
                                : "text-xs text-muted-foreground"
                            }
                          >
                            {expired
                              ? "expired"
                              : `expires ${new Date(
                                  invitation.expiresAt,
                                ).toLocaleDateString()}`}
                          </span>
                          <Button
                            className="ml-auto"
                            variant="ghost"
                            size="sm"
                            disabled={revokingInvitationId === invitation.id}
                            onClick={() =>
                              void handleRevokeInvitation(
                                invitation.id,
                                invitation.email,
                              )
                            }
                          >
                            {revokingInvitationId === invitation.id
                              ? "Revoking…"
                              : expired
                                ? "Remove"
                                : "Revoke"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Expired invitations can be removed here, or re-sent by
                    inviting the same address again.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Dialog
            open={pendingRemoval !== null}
            onOpenChange={(open) => {
              if (!open) {
                setPendingRemoval(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>
                  Remove {pendingRemoval?.name || pendingRemoval?.email}?
                </DialogTitle>
                <DialogDescription>
                  They lose access to every project in {activeOrg.name}
                  immediately. You can add them again later.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPendingRemoval(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={memberPendingId !== null}
                  onClick={() => {
                    if (pendingRemoval) {
                      void handleRemove(pendingRemoval.userId);
                    }
                  }}
                >
                  {memberPendingId !== null ? "Removing…" : "Remove Member"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isAdmin && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TriangleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
                  Danger zone
                </CardTitle>
                <CardDescription>
                  Deleting an organization is permanent and only possible once
                  it has no projects.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                  <DialogTrigger render={<Button variant="destructive" />}>
                    <Trash2Icon aria-hidden="true" />
                    Delete Organization
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Delete {activeOrg.name}?</DialogTitle>
                      <DialogDescription>
                        Type the organization name to confirm. This cannot be
                        undone.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="my-6">
                      <Field>
                        <FieldLabel htmlFor="delete-confirm">
                          Organization name
                        </FieldLabel>
                        <Input
                          id="delete-confirm"
                          name="confirmation"
                          autoComplete="off"
                          value={deleteConfirm}
                          onChange={(event) => setDeleteConfirm(event.target.value)}
                          placeholder={activeOrg.name}
                        />
                      </Field>
                    </div>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDeleteOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={
                          isDeleting || deleteConfirm !== activeOrg.name
                        }
                        onClick={handleDelete}
                      >
                        {isDeleting ? "Deleting…" : "Delete Organization"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </>
  );
}

export default function Page() {
  return <SettingsContent />;
}
