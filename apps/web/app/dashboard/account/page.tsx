import type { Metadata } from "next";
import { AccountSettings } from "@/components/account/account-settings";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your sign-in methods, devices, and access tokens.",
};

export default function AccountPage() {
  return <AccountSettings />;
}
