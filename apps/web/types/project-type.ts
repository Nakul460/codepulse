import { Dispatch, SetStateAction } from "react";
import type { ProjectRecord, ProjectType } from "@codepulse/shared";

/**
 * Wire shapes now live in `@codepulse/shared` so the API service and the web
 * app agree on them. Re-exported here because `@/types/project-type` is
 * imported across the app. The React prop types below are web-only and stay.
 */

export type {
  AccessTokenRecord,
  AccessTokenScope,
  ActivityAction,
  CreatedAccessToken,
  OrganizationRecord,
  OrgMemberRecord,
  ProjectActivityRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectType,
  RepositoryRecord,
} from "@codepulse/shared";

export type { MemberRole, OrgRole } from "@codepulse/shared";

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
