"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordRequirements } from "@/components/account/password-requirements";
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
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { PROVIDER_LABELS } from "@/lib/auth-client";
import {
  changePassword,
  createAccessToken,
  deleteAccount,
  getAccount,
  getAccountDeletionBlockers,
  listAccessTokens,
  listDeviceSessions,
  resendVerificationEmail,
  revokeAccessToken,
  revokeDeviceSession,
  revokeOtherSessions,
  unlinkProvider,
  type AccountDeletionBlocker,
  type AccountSummary,
  type DeviceSession,
  type LinkedAccount,
} from "@/lib/api";
import {
  KeyRoundIcon,
  LaptopIcon,
  Link2Icon,
  LogOutIcon,
  MailCheckIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import type { AccessTokenRecord, CreatedAccessToken } from "@/types/project-type";

/** How a `lastSeenAt` timestamp is described in the sessions list. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function AccountSettings() {
  return (
    <SidebarInset id="main-content">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:z-auto md:bg-transparent md:backdrop-blur-none">
        <SidebarTrigger className="-ml-1" />
        <h1 className="text-base font-medium">Account</h1>
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <p className="max-w-prose text-sm text-muted-foreground">
          Your sign-in methods, logged-in devices, and personal access tokens.
          Changes here apply only to you.
        </p>
        <IdentitySection />
        <PasswordSection />
        <SessionsSection />
        <ConnectionsSection />
        <TokensSection />
        <DangerZone />
      </div>
    </SidebarInset>
  );
}

function IdentitySection() {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    // No `setLoading(true)` here: the state already starts as `true`, and an
    // effect body that sets state synchronously forces a second render pass
    // before the request is even sent. `finally` below flips it once the
    // request settles.
    const controller = new AbortController();

    getAccount(controller.signal)
      .then(({ account: loaded }) => setAccount(loaded))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast.add({
          type: "error",
          description:
            error instanceof Error ? error.message : "Could not load your account.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);


  async function resend() {
    setResending(true);
    try {
      await resendVerificationEmail();
      toast.add({
        type: "success",
        description: "Verification email sent. Check your inbox.",
      });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Could not send the verification email.",
      });
    } finally {
      setResending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>
          The email and sign-in method this account uses.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{account?.name || "—"}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {account?.email}
                {account?.emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <MailCheckIcon className="size-3.5" aria-hidden="true" />
                    Verified
                  </span>
                ) : (
                  <span className="text-xs text-destructive">Not verified</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd>
                {account?.lastLoginMethod
                  ? (PROVIDER_LABELS[account.lastLoginMethod] ??
                    account.lastLoginMethod)
                  : "—"}
              </dd>
            </dl>

            {account && !account.emailVerified ? (
              <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-destructive">
                  Your email is not verified. Some security checks are limited
                  until it is.
                </p>
                {account.canVerifyEmail ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resending}
                    onClick={() => void resend()}
                  >
                    {resending ? "Sending…" : "Resend email"}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No mail sender is configured for this deployment, so
                    verification cannot be delivered here.
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getAccount()
      .then(({ account }) => setHasPassword(account.hasPassword))
      .catch(() => undefined);
  }, []);

  async function submit() {
    if (newPassword !== confirmPassword) {
      toast.add({ type: "error", description: "The new passwords do not match." });
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: revokeOthers,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.add({
        type: "success",
        description: revokeOthers
          ? "Password changed. Other devices were signed out."
          : "Password changed.",
      });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not change your password.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          {hasPassword === false
            ? "Set a password so you can sign in without a provider."
            : "Changing your password signs out your other devices."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasPassword === true ? (
          <Field>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <PasswordRequirements password={newPassword} />
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>

        {hasPassword === true ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={revokeOthers}
              onChange={(event) => setRevokeOthers(event.target.checked)}
            />
            Sign out all other devices
          </label>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          disabled={submitting || newPassword.length === 0}
          onClick={() => void submit()}
        >
          {submitting ? "Saving…" : "Update password"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function SessionsSection() {
  const router = useRouter();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [freshnessError, setFreshnessError] = useState(false);

  const load = useCallback(async () => {
    try {
      const { sessions } = await listDeviceSessions();
      setSessions(sessions);
      setFreshnessError(false);
    } catch (error) {
      // better-auth gates this on session.freshAge: listing every logged-in
      // device is reauth-worthy. Say so instead of showing a broken list.
      if (error instanceof Error && /fresh|recent|expired/i.test(error.message)) {
        setFreshnessError(true);
      } else {
        toast.add({ type: "error", description: "Could not load your sessions." });
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    listDeviceSessions(controller.signal)
      .then(({ sessions: loaded }) => {
        setSessions(loaded);
        setFreshnessError(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // better-auth gates this on session.freshAge: enumerating every
        // logged-in device is reauth-worthy. Say so instead of an empty list.
        if (error instanceof Error && /fresh|recent|expired/i.test(error.message)) {
          setFreshnessError(true);
        } else {
          toast.add({ type: "error", description: "Could not load your sessions." });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);


  async function revoke(sessionId: string) {
    setPendingId(sessionId);
    try {
      await revokeDeviceSession(sessionId);
      toast.add({ type: "success", description: "Device signed out." });
      // Revoking the session you are sitting on ends this request's session, so
      // a reload is the honest way to land back on a usable state.
      if (sessions.find((session) => session.id === sessionId)?.isCurrent) {
        router.push("/login");
        router.refresh();
        return;
      }
      await load();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not sign that device out.",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function revokeOthers() {
    setRevokingAll(true);
    try {
      await revokeOtherSessions();
      toast.add({ type: "success", description: "Other devices signed out." });
      await load();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not sign out other devices.",
      });
    } finally {
      setRevokingAll(false);
    }
  }

  const otherCount = sessions.filter((session) => !session.isCurrent).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed-in devices</CardTitle>
        <CardDescription>
          Every device with a live session on this account. Revoking one takes
          effect immediately.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={revokingAll || otherCount === 0}
            onClick={() => void revokeOthers()}
          >
            {revokingAll ? "Signing out…" : "Sign out others"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : freshnessError ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Signing in again is required before this device list can be shown.
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm"
              >
                <LaptopIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{session.deviceLabel}</span>
                {session.isCurrent ? (
                  <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                    This device
                  </span>
                ) : null}
                {session.isNewDevice ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                    New device
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {session.ipAddress ?? "unknown IP"} · seen{" "}
                  {relativeTime(session.lastSeenAt)}
                </span>
                <Button
                  className="ml-auto"
                  variant="ghost"
                  size="sm"
                  disabled={pendingId === session.id}
                  onClick={() => void revoke(session.id)}
                >
                  <LogOutIcon className="size-4" aria-hidden="true" />
                  {session.isCurrent ? "Sign out" : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionsSection() {
  const [connections, setConnections] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<LinkedAccount | null>(null);

  const load = useCallback(async () => {
    try {
      const { connections } = await getAccount();
      setConnections(connections);
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not load linked accounts.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getAccount(controller.signal)
      .then(({ connections: loaded }) => setConnections(loaded))
      .catch(() => toast.add({ type: "error", description: "Could not load linked accounts." }))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);


  async function unlink(providerId: string) {
    setPending(providerId);
    try {
      await unlinkProvider(providerId);
      toast.add({
        type: "success",
        description: `${PROVIDER_LABELS[providerId] ?? providerId} disconnected.`,
      });
      await load();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not disconnect that account.",
      });
    } finally {
      setPending(null);
      setConfirming(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>
          Providers linked to this account. Disconnecting one only affects how
          you sign in here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No providers are connected.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {connections.map((connection) => (
              <li
                key={connection.providerId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm"
              >
                <Link2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">
                  {PROVIDER_LABELS[connection.providerId] ?? connection.providerId}
                </span>
                {connection.linkedAt ? (
                  <span className="text-xs text-muted-foreground">
                    linked {relativeTime(connection.linkedAt)}
                  </span>
                ) : null}
                <Button
                  className="ml-auto"
                  variant="outline"
                  size="sm"
                  disabled={pending === connection.providerId}
                  onClick={() => setConfirming(connection)}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Disconnect{" "}
              {confirming
                ? (PROVIDER_LABELS[confirming.providerId] ?? confirming.providerId)
                : ""}
            </DialogTitle>
            <DialogDescription>
              You will no longer be able to sign in with this provider. If it is
              the only way to sign in, you will need to set a password first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending !== null}
              onClick={() => confirming && void unlink(confirming.providerId)}
            >
              {pending !== null ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TokensSection() {
  const [tokens, setTokens] = useState<AccessTokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<CreatedAccessToken | null>(null);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [readOnly, setReadOnly] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { tokens } = await listAccessTokens();
      setTokens(tokens);
    } catch (error) {
      toast.add({
        type: "error",
        description: error instanceof Error ? error.message : "Could not load your tokens.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    listAccessTokens(controller.signal)
      .then(({ tokens: loaded }) => setTokens(loaded))
      .catch(() => toast.add({ type: "error", description: "Could not load your tokens." }))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);


  async function create() {
    setCreating(true);
    try {
      const createdToken = await createAccessToken({
        name,
        scopes: readOnly ? ["read"] : ["read", "write"],
        expiresInDays: Number(expiresInDays),
      });
      setCreated(createdToken);
      setName("");
      await load();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not create a token.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function revoke(tokenId: string) {
    setRevokingId(tokenId);
    try {
      await revokeAccessToken(tokenId);
      toast.add({ type: "success", description: "Token revoked." });
      await load();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not revoke that token.",
      });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal access tokens</CardTitle>
        <CardDescription>
          Non-expiring credentials for scripts and CI. A token can never manage
          your account, so a leaked token cannot escalate itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {created ? (
          <div className="flex flex-col gap-2 rounded-lg border border-emerald-600/40 bg-emerald-500/5 p-4">
            <p className="text-sm font-medium">
              Copy this token now — it is shown once and never again.
            </p>
            <code className="block overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">
              {created.secret}
            </code>
            <p className="text-xs text-muted-foreground">{created.warning}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field className="flex-1">
            <FieldLabel htmlFor="token-name">Token name</FieldLabel>
            <Input
              id="token-name"
              value={name}
              placeholder="CI pipeline…"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field className="sm:w-36">
            <FieldLabel htmlFor="token-expiry">Expires in (days)</FieldLabel>
            <Input
              id="token-expiry"
              type="number"
              min={1}
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
            />
          </Field>
          <Field className="sm:w-40">
            <FieldLabel htmlFor="token-scope">Scope</FieldLabel>
            <select
              id="token-scope"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={readOnly ? "read" : "write"}
              onChange={(event) => setReadOnly(event.target.value === "read")}
            >
              <option value="read">Read</option>
              <option value="write">Read and write</option>
            </select>
          </Field>
          <Button
            disabled={creating || name.trim().length === 0}
            onClick={() => void create()}
          >
            {creating ? "Creating…" : "Create token"}
          </Button>
        </div>

        <Separator />

        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm"
              >
                <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{token.name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {token.scopes.join(", ")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {token.expiresAt
                    ? `expires ${new Date(token.expiresAt).toLocaleDateString()}`
                    : "no expiry"}
                </span>
                <Button
                  className="ml-auto"
                  variant="ghost"
                  size="sm"
                  disabled={revokingId === token.id}
                  onClick={() => void revoke(token.id)}
                >
                  {revokingId === token.id ? "Revoking…" : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DangerZone() {
  const router = useRouter();
  const [blockers, setBlockers] = useState<AccountDeletionBlocker[]>([]);
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void getAccountDeletionBlockers()
      .then(({ blockers }) => setBlockers(blockers))
      .catch(() => setBlockers([]))
      .finally(() => setChecking(false));
  }, []);

  async function remove() {
    setDeleting(true);
    try {
      await deleteAccount(password || undefined);
      // better-auth signs the user out and clears the cookie, so send them to a
      // page that does not require a session.
      router.push("/login");
      router.refresh();
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Could not delete your account.",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete account</CardTitle>
        <CardDescription>
          Permanently removes your account, its sessions, tokens, and memberships.
          Activities you created in other people&apos;s projects are kept so their
          audit history stays intact.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!checking && blockers.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            <p className="font-medium">
              Transfer or delete these organizations first — you are the only
              admin:
            </p>
            <ul className="list-inside list-disc text-muted-foreground">
              {blockers.map((blocker) => (
                <li key={blocker.organizationId}>
                  {blocker.organizationName} ({blocker.memberCount}{" "}
                  {blocker.memberCount === 1 ? "member" : "members"})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          variant="destructive"
          disabled={!checking && blockers.length > 0}
          onClick={() => setOpen(true)}
        >
          <Trash2Icon className="size-4" aria-hidden="true" />
          Delete account
        </Button>
      </CardFooter>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Your account, every session, and every
              personal access token are removed immediately.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="delete-password">
              Confirm with your password
            </FieldLabel>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FieldDescription>
              Required if your account has a password. OAuth-only accounts
              confirm by reconnecting and retrying.
            </FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
