import { existsSync, statSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

const ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2_000;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function match(pathname: string, pattern: RegExp): string[] | undefined {
  const captures = pattern.exec(pathname)?.slice(1);
  if (!captures) return undefined;
  const decoded: string[] = [];
  for (const capture of captures) {
    if (capture === undefined) {
      decoded.push("");
      continue;
    }
    try {
      const value = decodeURIComponent(capture);
      if (!ID_PATTERN.test(value)) return undefined;
      decoded.push(value);
    } catch {
      return undefined;
    }
  }
  return decoded;
}

function localPath(value: unknown, directory = false): string | undefined {
  const candidate = text(value, 2_000);
  if (
    !candidate ||
    !isAbsolute(candidate) ||
    normalize(candidate) !== candidate ||
    !existsSync(candidate)
  )
    return undefined;
  try {
    return !directory || statSync(candidate).isDirectory()
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
}

function optionalText(value: unknown, max: number): string | null | undefined {
  return value === null
    ? null
    : value === undefined
      ? undefined
      : text(value, max);
}

function withResources(
  context: AppContext,
  project: NonNullable<
    ReturnType<AppContext["services"]["sessions"]["getProject"]>
  >,
) {
  return {
    ...project,
    resources: context.services.sessions.projectResources(project.id),
  };
}

export async function handleProjectRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/projects") {
    return json({
      projects: context.services.sessions
        .listProjects(url.searchParams.get("includeArchived") === "true")
        .map((project) => withResources(context, project)),
    });
  }
  if (request.method === "POST" && url.pathname === "/projects") {
    const body = (await request.json()) as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      instructions?: unknown;
      color?: unknown;
      icon?: unknown;
      pinned?: unknown;
      primaryPath?: unknown;
    };
    const name = text(body.name, MAX_NAME_LENGTH);
    const description = optionalText(body.description, MAX_DESCRIPTION_LENGTH),
      instructions = optionalText(body.instructions, 8_000),
      color = optionalText(body.color, 32),
      icon = optionalText(body.icon, 64),
      primaryPath =
        body.primaryPath === undefined
          ? undefined
          : localPath(body.primaryPath, true);
    if (
      !name ||
      (body.id !== undefined &&
        (typeof body.id !== "string" || !ID_PATTERN.test(body.id))) ||
      description === null ||
      instructions === null ||
      color === null ||
      icon === null ||
      (body.pinned !== undefined && typeof body.pinned !== "boolean") ||
      (body.primaryPath !== undefined && !primaryPath)
    )
      return json({ error: "project fields are invalid" }, 400);
    try {
      return json(
        {
          project: withResources(
            context,
            context.services.sessions.createProject({
              id: body.id as string | undefined,
              name,
              description,
              instructions,
              color,
              icon,
              pinned: body.pinned as boolean | undefined,
              primaryPath,
            }),
          ),
        },
        201,
      );
    } catch {
      return json({ error: "project id already exists" }, 409);
    }
  }

  const archive = match(url.pathname, /^\/projects\/([^/]{1,768})\/archive$/);
  if (request.method === "POST" && archive?.[0]) {
    const body = (await request.json().catch(() => ({}))) as {
      archived?: unknown;
    };
    if (body.archived !== undefined && typeof body.archived !== "boolean")
      return json({ error: "archived must be a boolean" }, 400);
    const project = context.services.sessions.archiveProject(
      archive[0],
      body.archived ?? true,
    );
    return project
      ? json({ project: withResources(context, project) })
      : json({ error: "project not found" }, 404);
  }

  const resource = match(
    url.pathname,
    /^\/projects\/([^/]{1,768})\/resources(?:\/([^/]{1,768}))?$/,
  );
  if (resource) {
    const [projectId, resourceId] = resource;
    if (!projectId) return null;
    if (request.method === "GET" && !resourceId) {
      if (!context.services.sessions.getProject(projectId))
        return json({ error: "project not found" }, 404);
      return json({
        resources: context.services.sessions.projectResources(projectId),
      });
    }
    if (request.method === "POST" && !resourceId) {
      const body = (await request.json()) as {
        id?: unknown;
        kind?: unknown;
        label?: unknown;
        value?: unknown;
      };
      const kind = text(body.kind, 48),
        label = text(body.label, 240),
        value = text(body.value, 2_000);
      if (
        !kind ||
        !["file", "folder", "source", "note", "link"].includes(kind) ||
        !label ||
        !value ||
        (["file", "folder"].includes(kind) &&
          !localPath(value, kind === "folder")) ||
        (body.id !== undefined &&
          (typeof body.id !== "string" || !ID_PATTERN.test(body.id)))
      )
        return json({ error: "resource fields are invalid" }, 400);
      try {
        const projectResource = context.services.sessions.addProjectResource(
          projectId,
          {
            id: body.id as string | undefined,
            kind: kind as "file" | "folder" | "source" | "note" | "link",
            label,
            value,
          },
        );
        return projectResource
          ? json({ resource: projectResource }, 201)
          : json({ error: "project not found" }, 404);
      } catch {
        return json({ error: "resource id already exists" }, 409);
      }
    }
    if (request.method === "DELETE" && resourceId)
      return context.services.sessions.removeProjectResource(
        projectId,
        resourceId,
      )
        ? json({ removed: true })
        : json({ error: "resource not found" }, 404);
    return null;
  }

  const project = match(url.pathname, /^\/projects\/([^/]{1,768})$/)?.[0];
  if (!project) return null;
  if (request.method === "GET") {
    const value = context.services.sessions.getProject(project);
    return value
      ? json({ project: withResources(context, value) })
      : json({ error: "project not found" }, 404);
  }
  if (request.method === "PATCH") {
    const body = (await request.json()) as {
      name?: unknown;
      description?: unknown;
      instructions?: unknown;
      color?: unknown;
      icon?: unknown;
      pinned?: unknown;
      primaryPath?: unknown;
    };
    const name =
      body.name === undefined ? undefined : text(body.name, MAX_NAME_LENGTH);
    const description = optionalText(body.description, MAX_DESCRIPTION_LENGTH),
      instructions = optionalText(body.instructions, 8_000),
      color = optionalText(body.color, 32),
      icon = optionalText(body.icon, 64),
      primaryPath =
        body.primaryPath === null
          ? null
          : body.primaryPath === undefined
            ? undefined
            : localPath(body.primaryPath, true);
    if (
      (body.name !== undefined && !name) ||
      (body.description !== undefined && description === undefined) ||
      (body.instructions !== undefined && instructions === undefined) ||
      (body.color !== undefined && color === undefined) ||
      (body.icon !== undefined && icon === undefined) ||
      (body.pinned !== undefined && typeof body.pinned !== "boolean") ||
      (body.primaryPath !== undefined && primaryPath === undefined) ||
      (name === undefined &&
        description === undefined &&
        instructions === undefined &&
        color === undefined &&
        icon === undefined &&
        body.pinned === undefined &&
        primaryPath === undefined)
    )
      return json({ error: "project update is invalid" }, 400);
    const value = context.services.sessions.updateProject(project, {
      name,
      description,
      instructions,
      color,
      icon,
      pinned: body.pinned as boolean | undefined,
      primaryPath,
    });
    return value
      ? json({ project: withResources(context, value) })
      : json({ error: "project not found" }, 404);
  }
  return null;
}
