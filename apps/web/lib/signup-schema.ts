import { z } from "zod";
import {
  findPasswordIssues,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy";

/**
 * Sign-up form validation.
 *
 * The password field defers entirely to `findPasswordIssues`, which is the same
 * list better-auth enforces server-side inside its `password.hash` funnel (see
 * lib/auth.ts). Previously this schema restated a weaker version of the rules
 * (8 characters, no symbols requirement, no denylist), which meant the browser
 * accepted passwords the server then rejected — and would have kept accepting
 * 8-character passwords after the policy was raised.
 */
export const signupSchema = z
  .object({
    name: z
      .string()
      .min(3, "minimum 3 characters are required")
      .max(25, "maximum 25 characters are allowed"),
    email: z.email(),
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `must be at least ${PASSWORD_MIN_LENGTH} characters long`,
      )
      .max(
        PASSWORD_MAX_LENGTH,
        `must be at most ${PASSWORD_MAX_LENGTH} characters long`,
      )
      .superRefine((value, ctx) => {
        for (const message of findPasswordIssues(value)) {
          ctx.addIssue({ code: "custom", message });
        }
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "password does not match",
    path: ["confirmPassword"],
  });

export type SignupValues = z.infer<typeof signupSchema>;
