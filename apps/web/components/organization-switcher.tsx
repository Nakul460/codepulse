"use client";

import * as React from "react";
import { ChevronsUpDownIcon, PlusIcon, CheckIcon, SettingsIcon } from "lucide-react";
import { toast } from "@/components/ui/toast";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { createOrganization } from "@/lib/api";
import { ORG_ROLE_LABELS } from "@/lib/project-status";
import { ORG_NAME_MAX } from "@/lib/validation";
import { useOrganizations } from "@/components/organization-provider";

export function OrganizationSwitcher() {
  const { isMobile } = useSidebar();
  const { organizations, activeOrg, setActiveOrgId, refresh, isLoading } =
    useOrganizations();

  const [isCreating, setIsCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    setIsPending(true);
    try {
      const { organization } = await createOrganization(name.trim());
      setIsCreating(false);
      setName("");
      await refresh();
      setActiveOrgId(organization.id);
      toast.add({
        type: "success",
        description: `Created ${organization.name}`,
      });
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Could not create organization",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                aria-label="Switch organization"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {activeOrg ? activeOrg.name.charAt(0).toUpperCase() : "?"}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {isLoading ? "Loading…" : (activeOrg?.name ?? "No organization")}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {activeOrg ? (
                  <>
                    <span className="tabular-nums">
                      {activeOrg.projectCount} project
                      {activeOrg.projectCount === 1 ? "" : "s"}
                    </span>
                    {" · "}
                    {ORG_ROLE_LABELS[activeOrg.role]}
                  </>
                ) : (
                  "Create one to get started"
                )}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" aria-hidden="true" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-56"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organizations
              </DropdownMenuLabel>

              {organizations.length === 0 && !isLoading && (
                <DropdownMenuItem disabled>
                  You are not in any organization yet
                </DropdownMenuItem>
              )}

              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => setActiveOrgId(org.id)}
                  aria-current={org.id === activeOrg?.id ? "true" : undefined}
                  className="gap-2 p-2"
                >
                  <div
                    className="flex size-6 items-center justify-center rounded-md border text-[10px] font-semibold"
                    aria-hidden="true"
                  >
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{org.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {ORG_ROLE_LABELS[org.role]} ·{" "}
                      <span className="tabular-nums">
                        {org.projectCount} project
                        {org.projectCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  {org.id === activeOrg?.id && (
                    <>
                      <CheckIcon aria-hidden="true" />
                      <span className="sr-only">Active</span>
                    </>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => setIsCreating(true)} className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border">
                <PlusIcon className="size-4" aria-hidden="true" />
              </div>
              <div className="font-medium">New Organization</div>
            </DropdownMenuItem>

            {activeOrg && (
              <DropdownMenuItem
                render={
                  <Link href={`/dashboard/settings?org=${activeOrg.id}`} />
                }
                className="gap-2 p-2"
              >
                <div
                  className="flex size-6 items-center justify-center rounded-md border"
                  aria-hidden="true"
                >
                  <SettingsIcon className="size-4" aria-hidden="true" />
                </div>
                <div className="font-medium">Organization Settings</div>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New organization</DialogTitle>
              <DialogDescription>
                Organizations own projects and their members.
              </DialogDescription>
            </DialogHeader>

            <Field className="my-6">
              <FieldLabel htmlFor="org-name">Name</FieldLabel>
              <Input
                id="org-name"
                name="organizationName"
                autoComplete="organization"
                maxLength={ORG_NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Engineering…"
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !name.trim()}>
                {isPending ? "Creating…" : "Create organization"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarMenu>
  );
}
