"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { OrganizationProvider } from "@/components/organization-provider";
import { AppSidebar } from "@/components/app-sidebar";

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
      <SidebarProvider>
        <AppSidebar />
        {children}
      </SidebarProvider>
    </OrganizationProvider>
  );
}
