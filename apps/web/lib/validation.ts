import { z } from "zod";
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

export const addOrgMemberSchema = z.object({
  email: z.email("Enter a valid email address"),
  // Deliberately no `role`: new members always join as "member". Promotion to
  // admin is a separate, deliberate PATCH on an existing member, so a single
  // request cannot mint an admin out of nothing.
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

export const memberRoleSchema = z.enum(MEMBER_ROLES);

export const addMemberSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: memberRoleSchema.exclude(["owner"]).default("viewer"),
});

export const updateMemberSchema = z.object({
  role: memberRoleSchema.exclude(["owner"]),
});
