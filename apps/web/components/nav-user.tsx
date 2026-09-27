"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { authClient } from "@/lib/auth-client";
import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "./ui/toast";

interface userType {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
}

function initials(name: string | null | undefined) {
  const trimmed = name?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 2).toLocaleUpperCase() : "?";
}

function AccountSummary({ userData }: { userData?: userType }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
      <Avatar>
        <AvatarImage
          src={userData?.image ?? undefined}
          alt={userData?.name ?? ""}
        />
        <AvatarFallback>{initials(userData?.name)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">
          {userData?.name ?? "Signed in"}
        </span>
        {userData?.email && (
          <span
            className="truncate text-xs"
            translate="no"
            title={userData.email}
          >
            {userData.email}
          </span>
        )}
      </div>
    </div>
  );
}

export function NavUser() {
  const [userData, setUserData] = useState<userType>();
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function fetchUser() {
      const { data, error } = await authClient.getSession({
        fetchOptions: { signal: controller.signal },
      });

      if (!active) {
        return;
      }

      if (error) {
        return;
      }

      setUserData(data?.user as userType | undefined);
    }

    fetchUser();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function handleLogout() {
    setIsSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        toast.add({
          type: "error",
          description: error.message || "Could not sign out. Try again.",
        });
        return;
      }
      router.push("/login");
    } finally {
      setIsSigningOut(false);
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
                className="aria-expanded:bg-muted"
                aria-label="Account menu"
              />
            }
          >
            <Avatar>
              <AvatarImage
                src={userData?.image ?? undefined}
                alt={userData?.name ?? ""}
              />
              <AvatarFallback>{initials(userData?.name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {userData?.name ?? "Signed in"}
              </span>
              {userData?.email && (
                <span
                  className="truncate text-xs"
                  translate="no"
                  title={userData.email}
                >
                  {userData.email}
                </span>
              )}
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <AccountSummary userData={userData} />
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={isSigningOut}
            >
              <LogOutIcon aria-hidden="true" />
              {isSigningOut ? "Logging out…" : "Log Out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
