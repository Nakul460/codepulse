import z from "zod";

export const signupSchema = z
  .object({
    name: z
      .string()
      .min(3, "minimum 3 characters are required")
      .max(25, "maximum 25 characters are allowed"),
    email: z.email(),
    password: z
      .string()
      .min(8, "must be at least 8 characters long")
      .regex(/[a-z]/, "at least on lowercase letter is required")
      .regex(/[A-Z]/, "at least on uppercase letter is required")
      .regex(/[0-9]/, "at least one number is required"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "password does not match",
    path: ["confirmPassword"],
  });
