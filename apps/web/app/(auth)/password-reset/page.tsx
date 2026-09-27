"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PasswordResetPage() {
  const [newPass, setNewPass] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function resetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = new URLSearchParams(window.location.search).get("token");

    // Return early. Previously this only alerted and then still submitted with
    // an empty token, so the user saw a native dialog and a second error.
    if (!token) {
      setTokenError(
        "This reset link is missing its token. Request a new link and try again.",
      );
      return;
    }

    setTokenError(null);
    setIsPending(true);

    try {
      const { error } = await authClient.resetPassword({
        newPassword: newPass,
        token,
      });

      if (error) {
        toast.add({
          type: "error",
          description: error.message || "Could not reset your password.",
        });
        return;
      }

      toast.add({ type: "success", description: "Password reset" });
      router.push("/login");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset Your Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={resetPassword} noValidate>
          <FieldGroup>
            <Field data-invalid={!!tokenError}>
              <FieldLabel htmlFor="new-password">New Password</FieldLabel>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="Enter a new password…"
                aria-invalid={!!tokenError}
                aria-describedby={tokenError ? "reset-token-error" : undefined}
              />
              {tokenError && (
                <FieldError id="reset-token-error">{tokenError}</FieldError>
              )}
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={isPending || !newPass}>
            {isPending ? "Resetting…" : "Reset Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
