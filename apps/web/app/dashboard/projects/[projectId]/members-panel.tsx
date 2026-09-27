"use client";

import { useState } from "react";
import { Trash2Icon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { addMember, removeMember, updateMemberRole } from "@/lib/api";
import { ASSIGNABLE_ROLES, MEMBER_ROLE_LABELS } from "@/lib/project-status";
import { toast } from "@/components/ui/toast";
import type { MemberRole, ProjectMemberRecord } from "@/types/project-type";

interface MembersPanelProps {
  projectId: string;
  canManage: boolean;
  members: ProjectMemberRecord[];
  isLoading: boolean;
  onChanged: (members: ProjectMemberRecord[]) => void;
}

export function MembersPanel({
  projectId,
  canManage,
  members,
  isLoading,
  onChanged,
}: MembersPanelProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<MemberRole, "owner">>("viewer");
  const [isPending, setIsPending] = useState(false);
  const [pendingRemoval, setPendingRemoval] =
    useState<ProjectMemberRecord | null>(null);

  async function run(action: () => Promise<{ members: ProjectMemberRecord[] }>) {
    setIsPending(true);
    try {
      const result = await action();
      onChanged(result.members);
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "Something went wrong",
      });
      throw error;
    } finally {
      setIsPending(false);
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();

    if (!email.trim()) {
      return;
    }

    try {
      await run(() => addMember(projectId, email.trim(), role));
      setEmail("");
      setRole("viewer");
      toast.add({ type: "success", description: "Member added" });
    } catch {
      // Error already surfaced by run().
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  // The roster is owner-only, so anyone else would see an empty list with no
  // explanation. Say why instead.
  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Only the project owner can see the member list.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col divide-y">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {member.name || member.email}
              </span>
              <span
                className="truncate text-xs text-muted-foreground"
                translate="no"
                title={member.email}
              >
                {member.email}
              </span>
            </div>

            {member.role === "owner" ? (
              <span className="text-xs font-medium text-muted-foreground">
                {MEMBER_ROLE_LABELS.owner}
              </span>
            ) : canManage ? (
              <Select
                value={member.role}
                onValueChange={(value) =>
                  run(() =>
                    updateMemberRole(
                      projectId,
                      member.userId,
                      value as Exclude<MemberRole, "owner">,
                    ),
                  ).catch(() => {})
                }
                disabled={isPending}
              >
                <SelectTrigger
                  size="sm"
                  className="w-28"
                  aria-label={`Role for ${member.email}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ASSIGNABLE_ROLES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {MEMBER_ROLE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-muted-foreground">
                {MEMBER_ROLE_LABELS[member.role]}
              </span>
            )}

            {canManage && member.role !== "owner" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${member.name || member.email}`}
                disabled={isPending}
                onClick={() => setPendingRemoval(member)}
              >
                <Trash2Icon className="text-destructive" aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-end gap-3 border-t pt-6"
        >
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="member-email">Add by email</FieldLabel>
            <Input
              id="member-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com…"
              disabled={isPending}
            />
          </Field>

          <Field className="w-32">
            <FieldLabel htmlFor="member-role">Role</FieldLabel>
            <Select
              value={role}
              onValueChange={(value) =>
                setRole(value as Exclude<MemberRole, "owner">)
              }
            >
              <SelectTrigger id="member-role" className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ASSIGNABLE_ROLES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {MEMBER_ROLE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Button type="submit" disabled={isPending || !email.trim()}>
            <UserPlusIcon aria-hidden="true" />
            Add Member
          </Button>
        </form>
      )}

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
              They lose access to this project immediately. You can add them
              again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                const target = pendingRemoval;
                if (!target) {
                  return;
                }
                run(() => removeMember(projectId, target.userId))
                  .then(() => setPendingRemoval(null))
                  .catch(() => {
                    // Error already surfaced by run(); keep the dialog open.
                  });
              }}
            >
              {isPending ? "Removing…" : "Remove Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
