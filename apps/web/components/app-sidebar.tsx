"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NavUser } from "@/components/nav-user"
import { OrganizationSwitcher } from "@/components/organization-switcher"
import { useOrganizations } from "@/components/organization-provider"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  FolderKanbanIcon,
  CircleDotIcon,
  GitForkIcon,
  Settings2Icon,
  UserRoundIcon,
} from "lucide-react"

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { activeOrgId } = useOrganizations()
  const orgQuery = activeOrgId ? `?org=${activeOrgId}` : ""

  const items = [
    { title: "Projects", href: `/dashboard${orgQuery}`, icon: FolderKanbanIcon, base: "/dashboard" },
    { title: "Issues", href: `/dashboard/issues${orgQuery}`, icon: CircleDotIcon, base: "/dashboard/issues" },
    { title: "Repositories", href: `/dashboard/repositories${orgQuery}`, icon: GitForkIcon, base: "/dashboard/repositories" },
    { title: "Settings", href: `/dashboard/settings${orgQuery}`, icon: Settings2Icon, base: "/dashboard/settings" },
    // Account is about *you*, not the active org, so it deliberately carries no
    // `?org=` query: those pages are session-scoped and must not change when the
    // org switcher does.
    { title: "Account", href: "/dashboard/account", icon: UserRoundIcon, base: "/dashboard/account" },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pt-[max(0.5rem,env(safe-area-inset-top))]">
        <OrganizationSwitcher />
      </SidebarHeader>

      <SidebarContent className="overscroll-contain">
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(({ title, href, icon: Icon, base }) => (
                <SidebarMenuItem key={base}>
                  <SidebarMenuButton
                    render={<Link href={href} />}
                    isActive={
                      pathname === base ||
                      (base === "/dashboard"
                        ? pathname.startsWith("/dashboard/projects/")
                        : pathname.startsWith(`${base}/`))
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span>{title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
