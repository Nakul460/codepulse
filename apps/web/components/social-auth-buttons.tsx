"use client";

import { useState } from "react";
import { authClient, PROVIDER_LABELS } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import type { SocialProviderId } from "@/lib/social-providers";
import { toast } from "@/components/ui/toast";

const PROVIDER_BUTTON_LABEL: Record<SocialProviderId, string> = {
  github: "Continue with GitHub",
  google: "Continue with Google",
};

/**
 * The OAuth buttons.
 *
 * `providers` is passed in from a **server** component. It cannot be computed in
 * the browser: the client IDs are not `NEXT_PUBLIC_` variables, and
 * `lib/social-providers.ts` reads `process.env` at module scope. Passing the list
 * down also means a provider with no credentials gets no button at all, rather
 * than a button that fails mid-handshake with an opaque OAuth error.
 */
export function SocialAuthButtons({
  action,
  providers,
  callbackUrl,
}: {
  action: "sign-in" | "sign-up";
  providers: SocialProviderId[];
  /** Where to land afterwards, when the caller knows. Must already be sanitised. */
  callbackUrl?: string;
}) {
  const [pending, setPending] = useState<SocialProviderId | null>(null);

  if (providers.length === 0) {
    return null;
  }

  // No explicit callbackURL: better-auth resolves it from BETTER_AUTH_URL, so a
  // hardcoded localhost would strand users in dev after a real deploy.
  async function signIn(provider: SocialProviderId) {
    setPending(provider);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        ...(callbackUrl ? { callbackURL: callbackUrl } : {}),
      });

      if (error) {
        toast.add({
          type: "error",
          description:
            error.message ||
            `Could not ${action} with ${PROVIDER_LABELS[provider]}.`,
        });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          disabled={pending !== null}
          onClick={() => void signIn(provider)}
        >
          {pending === provider
            ? "Redirecting…"
            : PROVIDER_BUTTON_LABEL[provider]}
        </Button>
      ))}
    </div>
  );
}
