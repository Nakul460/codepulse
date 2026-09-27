import mongoose, { Schema } from "mongoose";
import {
  ACTIVITY_ACTIONS,
  MEMBER_ROLES,
  ORG_ROLES,
  PROJECT_STATUSES,
  type ActivityAction,
  type MemberRole,
  type OrgRole,
  type ProjectStatus,
} from "@/lib/project-status";

export {
  ACTIVITY_ACTIONS,
  MEMBER_ROLES,
  ORG_ROLES,
  PROJECT_STATUSES,
};
export type { ActivityAction, MemberRole, OrgRole, ProjectStatus };

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ createdBy: 1 });

const organizationMemberSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    role: { type: String, enum: ORG_ROLES, default: "member" },
  },
  { timestamps: true },
);

organizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);

// Organization-level audit trail. Kept separate from ProjectActivity because
// these events (member added, role changed, org deleted) are not scoped to a
// project, and they are the events that matter most after an account takeover.
const organizationActivitySchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    actorId: { type: String, required: true },
    actorName: { type: String, default: "" },
    action: { type: String, required: true },
    target: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

organizationActivitySchema.index({ organizationId: 1, createdAt: -1 });

const projectSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    projectName: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: { type: String, enum: PROJECT_STATUSES, default: "ongoing" },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    budget: { type: Number, default: 0, min: 0 },
    archivedAt: { type: Date, default: null, index: true },
    archivedBy: { type: String, default: null },
  },
  { timestamps: true },
);

projectSchema.index({ organizationId: 1, archivedAt: 1 });

const projectMemberSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    // Only meaningful for users who are not already covered by their org role.
    role: { type: String, enum: MEMBER_ROLES, default: "viewer" },
  },
  { timestamps: true },
);

projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

const projectActivitySchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    actorId: { type: String, required: true },
    actorName: { type: String, default: "" },
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
    changes: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

projectActivitySchema.index({ projectId: 1, createdAt: -1 });
projectActivitySchema.index({ organizationId: 1, createdAt: -1 });

export const organizationModel =
  mongoose.models.Organization ??
  mongoose.model("Organization", organizationSchema);

export const organizationMemberModel =
  mongoose.models.OrganizationMember ??
  mongoose.model("OrganizationMember", organizationMemberSchema);

export const projectModel =
  mongoose.models.Project ?? mongoose.model("Project", projectSchema);

export const projectMemberModel =
  mongoose.models.ProjectMember ??
  mongoose.model("ProjectMember", projectMemberSchema);

export const projectActivityModel =
  mongoose.models.ProjectActivity ??
  mongoose.model("ProjectActivity", projectActivitySchema);

export const organizationActivityModel =
  mongoose.models.OrganizationActivity ??
  mongoose.model("OrganizationActivity", organizationActivitySchema);

export default projectModel;
