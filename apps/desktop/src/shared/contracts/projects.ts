export type ProjectResourceKind =
  | "file"
  | "folder"
  | "link"
  | "note"
  | "source";

export interface ProjectResource {
  id: string;
  projectId: string;
  kind: ProjectResourceKind;
  label: string;
  value: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  primaryPath?: string;
  pinned: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  resources: ProjectResource[];
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
}
