import { z } from "zod";
import { ACCESS_TOKEN_SCOPES } from "@codepulse/shared";
import { findPasswordIssues } from "@/lib/password-policy";
import {
  MEMBER_ROLES,
  ORG_ROLES,
  PROJECT_STATUSES,
} from "@/lib/project-status";

// Kept in sync with the max() below so the UI can cap input length instead of
// letting the user type something the server will reject.
export const ORG_NAME_MAX = 80;

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(ORG_NAME_MAX, `Name must be ${ORG_NAME_MAX} characters or fewer`),
});

export const updateOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(ORG_NAME_MAX, `Name must be ${ORG_NAME_MAX} characters or fewer`),
});

/**
 * Creating an organization invitation.
 *
 * `role` is restricted to `member`. An invitation is the *only* way to add
 * someone now, so if it could grant `admin` directly, a forwarded or guessed
 * invite URL would be an admin-escalation path. The inviter wants a colleague as
 * an admin: they add them as a member, then promote them with the existing
 * `updateOrgMemberSchema` PATCH, which is auditable as a distinct action and is
 * reversible. Two deliberate steps beat one that cannot be taken back.
 */
export const createInvitationSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(ORG_ROLES).default("member").refine((role) => role === "member", {
    message: "Invitations can only grant member. Promote to admin after they join.",
  }),
});

export const updateOrgMemberSchema = z.object({
  role: z.enum(ORG_ROLES),
});

function coerceDate(value: string | Date | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/** For create: an absent date means "no date", i.e. null. */
const requiredDate = z
  .union([z.date(), z.string(), z.null()])
  .nullish()
  .transform(coerceDate);

/**
 * For update: an absent key must stay absent so the field is not overwritten
 * with null when a client patches a single field.
 */
const optionalDate = z
  .union([z.date(), z.string(), z.null()])
  .nullish()
  .transform((value) => (value === undefined ? undefined : coerceDate(value)));

const baseProjectFields = {
  projectName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  description: z.string().trim().max(2000, "Description is too long").default(""),
  status: z.enum(PROJECT_STATUSES).default("ongoing"),
  startDate: requiredDate,
  endDate: requiredDate,
  budget: z.coerce.number().min(0, "Budget cannot be negative").default(0),
};

function assertDateOrder(
  data: { startDate: Date | null; endDate: Date | null },
  ctx: z.RefinementCtx,
) {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "End date must be on or after the start date",
    });
  }
}

export const createProjectSchema = z
  .object({
    ...baseProjectFields,
    organizationId: z.string().min(1, "Pick an organization"),
  })
  .superRefine(assertDateOrder);

/**
 * Date order is intentionally NOT checked here: a patch usually carries only
 * one of the two dates, so the comparison is done against the stored project
 * in the route handler.
 */
export const updateProjectSchema = z.object({
  projectName: baseProjectFields.projectName.optional(),
  // No default here: a default would inject `description: ""` into every patch
  // and wipe the stored description.
  description: z.string().trim().max(2000, "Description is too long").optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  budget: z.coerce.number().min(0).optional(),
});

export const createIssueSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(20000).default(""),
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).default("BACKLOG"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  labels: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid due date").nullable().optional(),
  estimate: z.number().min(0).max(1000).nullable().optional(),
  parentIssueId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  relatedIssueIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(20).default([]),
  attachments: z.array(z.object({ name: z.string().trim().min(1).max(180), url: z.url().max(2048).refine((value) => ["https:", "http:"].includes(new URL(value).protocol), "Use an HTTP or HTTPS link"), mimeType: z.string().max(120).default(""), size: z.number().int().min(0).max(25 * 1024 * 1024) })).max(10).default([]),
});

export const updateIssueSchema = createIssueSchema.omit({ projectId: true }).partial();
export const createIssueCommentSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  mentions: z.array(z.string()).max(20).default([]),
});

export const memberRoleSchema = z.enum(MEMBER_ROLES);

export const addMemberSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: memberRoleSchema.exclude(["owner"]).default("viewer"),
});

export const updateMemberSchema = z.object({
  role: memberRoleSchema.exclude(["owner"]),
});

/** Query for `GET /api/repositories`, which mirrors listProjects. */
export const listRepositoriesSchema = z.object({
  orgId: z.string().optional(),
});

/** Query for the install redirect, which an org admin starts. */
export const startInstallSchema = z.object({
  orgId: z.string().min(1, "Pick an organization"),
});

/**
 * Query GitHub sends back to the install callback. `installation_id` is a
 * numeric id; the `state` is signed by us and carries the org and user, so it
 * is only length-checked here and verified in lib/github.ts.
 */
export const installCallbackSchema = z.object({
  installation_id: z.string().regex(/^\d+$/, "Invalid installation id"),
  setup_action: z.enum(["install", "update", "request"]).optional(),
  state: z.string().min(1, "Missing install state"),
});

/**
 * Body for `POST /api/tokens`.
 *
 * A token always gets an expiry: `expiresInDays` is optional and falls back to
 * a default, and there is deliberately no way to ask for a non-expiring token.
 * A credential that can only be killed by scrolling a list of tokens is a
 * liability, and the "revoke everything" path requires knowing which account
 * leaked.
 */
export const createAccessTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name this token so you can recognise it later")
    .max(60, "Name must be 60 characters or fewer"),
  scopes: z
    .array(z.enum(ACCESS_TOKEN_SCOPES))
    .min(1, "Pick at least one scope")
    .max(ACCESS_TOKEN_SCOPES.length)
    .default(["read"]),
  expiresInDays: z.coerce
    .number()
    .int("Expiry must be a whole number of days")
    .min(1, "Expiry must be at least 1 day")
    .max(365, "Expiry must be 365 days or fewer")
    .optional(),
});

export type CreateAccessTokenInput = z.infer<typeof createAccessTokenSchema>;

/**
 * The password policy as a schema.
 *
 * Built from `PASSWORD_REQUIREMENTS` rather than restated, so the browser and
 * the server (which enforces the same list inside better-auth's `password.hash`
 * funnel — see lib/auth.ts) can never disagree about what is valid.
 */
export const passwordSchema = z.string().superRefine((value, ctx) => {
  for (const message of findPasswordIssues(value)) {
    ctx.addIssue({ code: "custom", message });
  }
});

export const changePasswordSchema = z
  .object({
    // Optional here because an OAuth-only account has no password to prove: it
    // is setting its *first* one. For an account that already has a credential
    // account, better-auth itself rejects the change without a matching
    // `currentPassword`, so omitting it cannot bypass the reauth check.
    currentPassword: z.string().min(1).optional(),
    newPassword: passwordSchema,
    // Changing a password without killing the other sessions leaves a stolen
    // cookie valid, so this defaults to on rather than being opt-in.
    revokeOtherSessions: z.boolean().default(true),
  })
  .refine(
    (value) => !value.currentPassword || value.currentPassword !== value.newPassword,
    {
      message: "Choose a password you have not used before",
      path: ["newPassword"],
    },
  );

/** The OAuth providers a user may disconnect from their account. */
export const unlinkableProviders = ["github", "google"] as const;

export const unlinkProviderSchema = z.object({
  providerId: z.enum(unlinkableProviders),
});
