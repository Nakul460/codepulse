"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { OrganizationProvider } from "@/components/organization-provider";

/**
 * Client half of the dashboard layout. The session check itself lives in the
 * server layout so an invalid or forged cookie never renders the shell.
 */
export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrganizationProvider>
      <SidebarProvider>{children}</SidebarProvider>
    </OrganizationProvider>
  );
}
