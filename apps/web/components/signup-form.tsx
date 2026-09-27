"use client";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SocialAuthButtons } from "@/components/social-auth-buttons";
import type { SocialProviderId } from "@/lib/social-providers";
import { signupSchema } from "@/lib/signup-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./ui/toast";
import Link from "next/link";

export function SignupForm({
  providers,
  next,
  ...props
}: React.ComponentProps<typeof Card> & {
  providers: SocialProviderId[];
  /** Sanitised internal path to land on after registering. */
  next?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function signupSubmit(formData: z.infer<typeof signupSchema>) {
    setIsSubmitting(true);
    try {
      const { error } = await authClient.signUp.email({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        image: "",
      });

      if (error) {
        toast.add({
          type: "error",
          description: error.message || "Could not create your account.",
        });
        return;
      }

      toast.add({ type: "success", description: "Account created" });
      // Someone arriving from an invitation link should end up back on it, not
      // on an empty dashboard, or accepting the invitation becomes guesswork.
      router.push(next ?? "/dashboard");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Create an Account</CardTitle>
        <CardDescription>
          Enter your details below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(signupSubmit)} noValidate>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="name">Full Name</FieldLabel>
                  <Input
                    {...field}
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Ada Lovelace…"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "name-error" : undefined
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError id="name-error" errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    placeholder="ada@example.com…"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "email-error" : undefined
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError id="email-error" errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    {...field}
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "password-error" : undefined
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError
                      id="password-error"
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />

            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="confirm-password">
                    Confirm Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "confirm-password-error" : undefined
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError
                      id="confirm-password-error"
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />

            <FieldGroup>
              <Field>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating Account…" : "Create Account"}
                </Button>
                {/*
                  Social sign-up is a separate affordance from the password form,
                  not a submit button inside it: these buttons redirect away, so
                  they must not carry `type="submit"` or a click would race the
                  form's own submit handler.
                */}
                <SocialAuthButtons
            action="sign-up"
            providers={providers}
            callbackUrl={next}
          />
                <FieldDescription className="px-6 text-center">
                  Already have an account?{" "}
                  <Link href="/login">Sign In</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
