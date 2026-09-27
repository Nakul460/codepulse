import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { ActivityIcon } from "lucide-react";

export default function LoginPage() {
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
          <LoginForm />
        </main>
      </div>
    </div>
  );
}
