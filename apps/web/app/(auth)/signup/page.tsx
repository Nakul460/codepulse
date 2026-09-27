import { SignupForm } from "@/components/signup-form";
import { getEnabledSocialProviders } from "@/lib/social-providers";
import { safeInternalPath } from "@/lib/redirect";

/** Mirrors the login page: a `?next=` destination, sanitised on the server. */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next, "/dashboard");

  return (
    <SignupForm
      className="w-full max-w-md"
      providers={getEnabledSocialProviders()}
      next={next}
    />
  );
}
