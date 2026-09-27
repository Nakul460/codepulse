"use client";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/lib/login-schema";
import z from "zod";
import { SocialAuthButtons } from "@/components/social-auth-buttons";
import type { SocialProviderId } from "@/lib/social-providers";
import { authClient } from "@/lib/auth-client";
import { toast } from "./ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({
  className,
  providers,
  next,
  ...props
}: React.ComponentProps<"div"> & {
  providers: SocialProviderId[];
  /** Sanitised internal path to land on after signing in. */
  next?: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function loginSubmit(loginData: z.infer<typeof loginSchema>) {
    setIsPending(true);
    try {
      const { error } = await authClient.signIn.email({
        email: loginData.email,
        password: loginData.password,
      });

      if (error) {
        toast.add({
          type: "error",
          description: error.message || "Could not sign in. Try again.",
        });
        return;
      }

      // Bounce straight back to wherever the visitor was heading — the
      // invitation page is the case that matters, since otherwise accepting an
      // invitation would require re-finding the link in the inbox.
      router.push(next ?? "/dashboard");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome Back</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(loginSubmit)} noValidate>
            <FieldGroup>
              <Field>
                <SocialAuthButtons
                    action="sign-in"
                    providers={providers}
                    callbackUrl={next}
                  />
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>

              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      {...field}
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      // Lets password managers fill the username field.
                      autoComplete="email"
                      spellCheck={false}
                      placeholder="ada@example.com…"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={
                        fieldState.invalid ? "login-email-error" : undefined
                      }
                    />
                    {fieldState.invalid && (
                      <FieldError
                        id="login-email-error"
                        errors={[fieldState.error]}
                      />
                    )}
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <div className="flex items-center">
                      <FieldLabel
                        data-invalid={fieldState.invalid}
                        htmlFor="password"
                      >
                        Password
                      </FieldLabel>
                      <Link
                        href="/request-new-password"
                        className="ml-auto text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </Link>
                    </div>
                    <Input
                      {...field}
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={
                        fieldState.invalid ? "login-password-error" : undefined
                      }
                    />

                    {fieldState.invalid && (
                      <FieldError
                        id="login-password-error"
                        errors={[fieldState.error]}
                      />
                    )}
                  </Field>
                )}
              />

              <Field>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Signing In…" : "Sign In"}
                </Button>
                <FieldDescription className="text-center">
                  Don&apos;t have an account?{" "}
                  <Link
                    href={
                      next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"
                    }
                  >
                    Sign Up
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        Signing in stores a session cookie on this device.
      </FieldDescription>
    </div>
  );
}
