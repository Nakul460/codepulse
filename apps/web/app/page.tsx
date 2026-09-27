import { redirect } from "next/navigation";

// proxy.ts already bounces "/" to the dashboard or login, so this is only a
// fallback for direct server renders.
export default function Home() {
  redirect("/dashboard");
}
