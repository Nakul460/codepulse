import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { getEnabledSocialProviders } from "@/lib/social-providers";
import { ActivityIcon } from "lucide-react";
import { safeInternalPath } from "@/lib/redirect";

/**
 * Accepts a `?next=` destination so a visitor who followed an invitation link
 * lands back on it after signing in. Sanitised here, on the server, because the
 * value is attacker-controlled and this is the boundary before it is ever used
 * as a navigation target.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next, "/dashboard");
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 self-center font-medium hover:underline underline-offset-4"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ActivityIcon className="size-4" aria-hidden="true" />
          </span>
          CodePulse
        </Link>
        <main id="main-content">
          <h1 className="sr-only">Sign in to CodePulse</h1>
          <LoginForm providers={getEnabledSocialProviders()} next={next} />
        </main>
      </div>
    </div>
  );
}
