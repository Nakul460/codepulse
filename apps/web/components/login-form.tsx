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
import { authClient } from "@/lib/auth-client";
import { toast } from "./ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // No explicit callbackURL: better-auth resolves it from BETTER_AUTH_URL, so
  // a hardcoded localhost would strand users in dev after a real deploy.
  async function gitHubAuth() {
    const { error } = await authClient.signIn.social({ provider: "github" });

    if (error) {
      toast.add({
        type: "error",
        description: error.message || "Could not sign in with GitHub.",
      });
    }
  }

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

      router.push("/dashboard");
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
                <Button
                  onClick={gitHubAuth}
                  variant="outline"
                  type="button"
                  disabled={isPending}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
                  </svg>
                  Sign In with GitHub
                </Button>
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
                  Don&apos;t have an account? <Link href="/signup">Sign Up</Link>
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
