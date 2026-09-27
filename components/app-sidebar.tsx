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
  Settings2Icon,
} from "lucide-react"

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { activeOrgId } = useOrganizations()
  const orgQuery = activeOrgId ? `?org=${activeOrgId}` : ""

  const items = [
    { title: "Projects", href: `/dashboard${orgQuery}`, icon: FolderKanbanIcon, base: "/dashboard" },
    { title: "Settings", href: `/dashboard/settings${orgQuery}`, icon: Settings2Icon, base: "/dashboard/settings" },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pt-[max(0.5rem,env(safe-area-inset-top))]">
        <SidebarMenu>
          <OrganizationSwitcher />
        </SidebarMenu>
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
                      (base !== "/dashboard" && pathname.startsWith(`${base}/`))
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
