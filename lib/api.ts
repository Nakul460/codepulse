import type {
  OrganizationRecord,
  OrgMemberRecord,
  ProjectActivityRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectType,
  OrgRole,
} from "@/types/project-type";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  url: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError(data.message ?? "Request failed", res.status);
  }

  return data as T;
}

export function listProjects(
  options: { archived?: boolean; organizationId?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (options.archived) {
    params.set("archived", "true");
  }
  if (options.organizationId) {
    params.set("orgId", options.organizationId);
  }

  const query = params.toString();
  return request<{ projects: ProjectRecord[] }>(
    `/api/projects${query ? `?${query}` : ""}`,
    { signal },
  );
}

export function createProject(values: ProjectType & { organizationId: string }) {
  return request<{ project: ProjectRecord }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export function listOrganizations(signal?: AbortSignal) {
  return request<{ organizations: OrganizationRecord[] }>("/api/organizations", {
    signal,
  });
}

export function createOrganization(name: string) {
  return request<{ organization: OrganizationRecord }>("/api/organizations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateOrganization(orgId: string, name: string) {
  return request<{ organization: OrganizationRecord }>(
    `/api/organizations/${orgId}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
}

export function deleteOrganization(orgId: string) {
  return request<{ message: string }>(`/api/organizations/${orgId}`, {
    method: "DELETE",
  });
}

export function listOrgMembers(orgId: string, signal?: AbortSignal) {
  return request<{ members: OrgMemberRecord[] }>(
    `/api/organizations/${orgId}/members`,
    { signal },
  );
}

// New members are always created as "member". Promotion is a separate,
// explicit call so granting admin rights can never ride along with an add.
export function addOrgMember(orgId: string, email: string) {
  return request<{ members: OrgMemberRecord[] }>(
    `/api/organizations/${orgId}/members`,
    { method: "POST", body: JSON.stringify({ email }) },
  );
}

export function updateOrgMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
) {
  return request<{ members: OrgMemberRecord[] }>(
    `/api/organizations/${orgId}/members/${userId}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function removeOrgMember(orgId: string, userId: string) {
  return request<{ members: OrgMemberRecord[] }>(
    `/api/organizations/${orgId}/members/${userId}`,
    { method: "DELETE" },
  );
}

export function updateProject(projectId: string, values: Partial<ProjectType>) {
  return request<{ project: ProjectRecord }>(`/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
}

export function getProject(projectId: string, signal?: AbortSignal) {
  return request<{ project: ProjectRecord }>(`/api/projects/${projectId}`, {
    signal,
  });
}

export function deleteProject(projectId: string) {
  return request<{ message: string }>(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
}

export function archiveProject(projectId: string) {
  return request<{ project: ProjectRecord }>(
    `/api/projects/${projectId}/archive`,
    { method: "POST" },
  );
}

export function restoreProject(projectId: string) {
  return request<{ project: ProjectRecord }>(
    `/api/projects/${projectId}/archive`,
    { method: "DELETE" },
  );
}

export function listMembers(projectId: string, signal?: AbortSignal) {
  return request<{ members: ProjectMemberRecord[] }>(
    `/api/projects/${projectId}/members`,
    { signal },
  );
}

export function addMember(
  projectId: string,
  email: string,
  role: "editor" | "viewer",
) {
  return request<{ members: ProjectMemberRecord[] }>(
    `/api/projects/${projectId}/members`,
    { method: "POST", body: JSON.stringify({ email, role }) },
  );
}

export function updateMemberRole(
  projectId: string,
  userId: string,
  role: "editor" | "viewer",
) {
  return request<{ members: ProjectMemberRecord[] }>(
    `/api/projects/${projectId}/members/${userId}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function removeMember(projectId: string, userId: string) {
  return request<{ members: ProjectMemberRecord[] }>(
    `/api/projects/${projectId}/members/${userId}`,
    { method: "DELETE" },
  );
}

export function listActivity(projectId: string, signal?: AbortSignal) {
  return request<{ activity: ProjectActivityRecord[] }>(
    `/api/projects/${projectId}/activity`,
    { signal },
  );
}
