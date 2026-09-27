import { Dispatch, SetStateAction } from "react";

export interface ProjectType {
  projectName: string;
  description: string;
  status: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  budget: number;
}

export type OrgRole = "admin" | "member";

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  memberCount: number;
  projectCount: number;
  createdAt: string;
}

export interface OrgMemberRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: OrgRole;
  joinedAt: string;
}

export interface ProjectRecord {
  id: string;
  organizationId: string;
  projectName: string;
  description: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budget: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: "owner" | "editor" | "viewer";
}

export type MemberRole = "owner" | "editor" | "viewer";

export interface ProjectMemberRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
  joinedAt: string;
}

export type ActivityAction =
  | "project.created"
  | "project.updated"
  | "project.archived"
  | "project.restored"
  | "project.deleted"
  | "member.added"
  | "member.removed"
  | "member.role_changed";

export interface ProjectActivityRecord {
  id: string;
  action: ActivityAction;
  actorId: string;
  actorName: string;
  changes: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateProjectDialogProps {
  handleCreateProject: (data: ProjectType) => Promise<void>;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export interface EditProjectDialogProps {
  project: ProjectRecord;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (project: ProjectRecord) => void;
}
