"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export default function RequestNewPassword() {
  const [userEmail, setUserEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function requestNewPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);

    // No explicit redirectTo: better-auth builds it from BETTER_AUTH_URL, so a
    // hardcoded localhost would send production users to a dead link.
    const { error } = await authClient.requestPasswordReset({
      email: userEmail,
    });

    setIsPending(false);

    if (error) {
      toast.add({
        type: "error",
        description: error.message || "Could not send the reset link.",
      });
      return;
    }

    setSent(true);
    toast.add({
      type: "success",
      description: "Check your email for a link to reset your password.",
    });
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check Your Email</CardTitle>
          <CardDescription>
            If an account exists for {userEmail}, a reset link is on its way. The
            link expires in one hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            render={<a href="/login" />}
          >
            Back to Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset Your Password</CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={requestNewPassword}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reset-email">Email</FieldLabel>
              <Input
                id="reset-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="ada@example.com…"
                required
              />
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={isPending || !userEmail.trim()}>
            {isPending ? "Sending…" : "Send Reset Link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
