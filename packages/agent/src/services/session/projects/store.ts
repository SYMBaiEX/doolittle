import { randomUUID } from "node:crypto";
import type { SessionDatabase } from "@/services/session/database";
import type { Project, ProjectResource } from "@/types";

export interface CreateProjectInput {
  id?: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  pinned?: boolean;
  primaryPath?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  instructions?: string | null;
  color?: string | null;
  icon?: string | null;
  pinned?: boolean;
  primaryPath?: string | null;
}

export interface AddProjectResourceInput {
  id?: string;
  kind: ProjectResource["kind"];
  label: string;
  value: string;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string | null;
  icon: string | null;
  pinned: number;
  primaryPath: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectResourceRow {
  id: string;
  projectId: string;
  kind: string;
  label: string;
  value: string;
  createdAt: string;
}

function asProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    instructions: row.instructions ?? undefined,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    pinned: Boolean(row.pinned),
    primaryPath: row.primaryPath ?? undefined,
    archivedAt: row.archivedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function asResource(row: ProjectResourceRow): ProjectResource {
  return { ...row, kind: row.kind as ProjectResource["kind"] };
}

export class ProjectStore {
  constructor(private readonly db: SessionDatabase) {}

  list(includeArchived = false): Project[] {
    const rows = this.db
      .query(
        `SELECT id, name, description, instructions, color, icon, pinned, primary_path as primaryPath, archived_at as archivedAt,
          created_at as createdAt, updated_at as updatedAt
         FROM projects
         ${includeArchived ? "" : "WHERE archived_at IS NULL"}
         ORDER BY updated_at DESC, id ASC`,
      )
      .all() as ProjectRow[];
    return rows.map(asProject);
  }

  get(id: string): Project | undefined {
    const row = this.db
      .query(
        `SELECT id, name, description, instructions, color, icon, pinned, primary_path as primaryPath, archived_at as archivedAt,
          created_at as createdAt, updated_at as updatedAt
         FROM projects WHERE id = ?1`,
      )
      .get(id) as ProjectRow | null;
    return row ? asProject(row) : undefined;
  }

  create(input: CreateProjectInput): Project {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    this.db
      .query(
        `INSERT INTO projects (id, name, description, instructions, color, icon, pinned, primary_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
      )
      .run(
        id,
        input.name,
        input.description ?? null,
        input.instructions ?? null,
        input.color ?? null,
        input.icon ?? null,
        input.pinned ? 1 : 0,
        input.primaryPath ?? null,
        now,
      );
    const project = this.get(id);
    if (!project) {
      throw new Error("Created project could not be read");
    }
    return project;
  }

  update(id: string, input: UpdateProjectInput): Project | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE projects SET name = ?2, description = ?3, instructions = ?4, color = ?5, icon = ?6, pinned = ?7, primary_path = ?8, updated_at = ?9
         WHERE id = ?1`,
      )
      .run(
        id,
        input.name ?? existing.name,
        input.description === undefined
          ? (existing.description ?? null)
          : input.description,
        input.instructions === undefined
          ? (existing.instructions ?? null)
          : input.instructions,
        input.color === undefined ? (existing.color ?? null) : input.color,
        input.icon === undefined ? (existing.icon ?? null) : input.icon,
        input.pinned === undefined
          ? existing.pinned
            ? 1
            : 0
          : input.pinned
            ? 1
            : 0,
        input.primaryPath === undefined
          ? (existing.primaryPath ?? null)
          : input.primaryPath,
        now,
      );
    return this.get(id);
  }

  archive(id: string, archived = true): Project | undefined {
    if (!this.get(id)) return undefined;
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE projects SET archived_at = ?2, updated_at = ?3 WHERE id = ?1`,
      )
      .run(id, archived ? now : null, now);
    return this.get(id);
  }

  resources(projectId: string): ProjectResource[] {
    const rows = this.db
      .query(
        `SELECT id, project_id as projectId, kind, label, value, created_at as createdAt
         FROM project_resources WHERE project_id = ?1 ORDER BY created_at ASC, id ASC`,
      )
      .all(projectId) as ProjectResourceRow[];
    return rows.map(asResource);
  }

  addResource(
    projectId: string,
    input: AddProjectResourceInput,
  ): ProjectResource | undefined {
    if (!this.get(projectId)) return undefined;
    const id = input.id ?? randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO project_resources (id, project_id, kind, label, value, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .run(id, projectId, input.kind, input.label, input.value, createdAt);
    this.db
      .query(`UPDATE projects SET updated_at = ?2 WHERE id = ?1`)
      .run(projectId, createdAt);
    return {
      id,
      projectId,
      kind: input.kind,
      label: input.label,
      value: input.value,
      createdAt,
    };
  }

  removeResource(projectId: string, resourceId: string): boolean {
    const result = this.db
      .query(`DELETE FROM project_resources WHERE project_id = ?1 AND id = ?2`)
      .run(projectId, resourceId);
    if (result.changes) {
      this.db
        .query(`UPDATE projects SET updated_at = ?2 WHERE id = ?1`)
        .run(projectId, new Date().toISOString());
    }
    return result.changes > 0;
  }

  assignSession(sessionId: string, projectId: string | undefined): boolean {
    if (!projectId) {
      this.db
        .query(`DELETE FROM session_projects WHERE session_id = ?1`)
        .run(sessionId);
      return true;
    }
    const project = this.get(projectId);
    if (!project || project.archivedAt) return false;
    this.db
      .query(
        `INSERT INTO session_projects (session_id, project_id, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(session_id) DO UPDATE SET project_id = excluded.project_id, updated_at = excluded.updated_at`,
      )
      .run(sessionId, projectId, new Date().toISOString());
    return true;
  }

  projectIdForSession(sessionId: string): string | undefined {
    const row = this.db
      .query(
        `SELECT project_id as projectId FROM session_projects WHERE session_id = ?1`,
      )
      .get(sessionId) as { projectId: string } | null;
    return row?.projectId;
  }
}
