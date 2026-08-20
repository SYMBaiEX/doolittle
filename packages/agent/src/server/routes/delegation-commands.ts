import { isPlainObject } from "@elizaos/shared/type-guards";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import {
  createEffectiveDelegationTask,
  executeEffectiveDelegationTask,
  getOfficialOrchestrator,
  projectOfficialTask,
  spawnEffectiveDelegationChild,
  superviseEffectiveDelegationQueue,
} from "@/runtime/native/service-bridge/delegation";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";

type DelegationTaskBody = {
  title?: string;
  objective?: string;
  group?: string;
  profile?: string;
  capabilityProfile?: string;
  kind?: "coding" | "research";
  framework?: string;
  accountId?: string;
  sessionId?: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  workspaceRoot?: string;
  /** Branch shown for the selected isolated worktree. */
  branch?: string;
  /** Retry-safe client identifier for the guided coding workflow. */
  launchId?: string;
  executionMode?: "local" | "delegated";
  maxAttempts?: number;
};

type GuidedCodingLaunchBody = DelegationTaskBody & {
  title: string;
  objective: string;
  workspaceRoot: string;
  branch: string;
  launchId: string;
};

type DelegationWorkerRunner = (
  context: AppContext,
  taskId: string,
  options?: { assumeRunning?: boolean },
) => Promise<{ notes?: string[] }>;

type DelegationAgentTurnRunner = (
  input: {
    message: string;
    userId: string;
    roomId: string;
    source: "api";
  },
  context: AppContext,
) => Promise<unknown>;

type DelegationCommandRouteOptions = {
  runDelegationTaskInWorker?: DelegationWorkerRunner;
  runAgentTurn?: DelegationAgentTurnRunner;
};

type ParsedBody = { body: Record<string, unknown> } | { response: Response };

async function readBody(request: Request): Promise<ParsedBody> {
  const parsed = await readJsonObjectBody(request);
  if (parsed.ok) return { body: parsed.value };
  return {
    response: json(
      {
        error:
          parsed.reason === "invalid_json"
            ? "Invalid JSON body"
            : "JSON body must be an object",
      },
      400,
    ),
  };
}

const GUIDED_CODING_FIELDS = new Set([
  "title",
  "objective",
  "group",
  "profile",
  "capabilityProfile",
  "kind",
  "framework",
  "accountId",
  "sessionId",
  "priority",
  "tags",
  "labels",
  "metadata",
  "workspaceRoot",
  "branch",
  "launchId",
  "executionMode",
  "maxAttempts",
]);

const guidedCodingLaunches = new WeakMap<
  object,
  Map<
    string,
    {
      fingerprint: string;
      promise: Promise<Awaited<ReturnType<typeof startGuidedCodingTask>>>;
    }
  >
>();

function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  options: { required?: boolean; multiline?: boolean } = {},
): string | undefined {
  if (value === undefined && !options.required) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const normalized = value.trim();
  if (options.required && !normalized) throw new Error(`${field} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters.`);
  }
  if (
    /\0/u.test(normalized) ||
    (!options.multiline && /[\r\n]/u.test(normalized))
  ) {
    throw new Error(`${field} contains unsupported control characters.`);
  }
  return normalized || undefined;
}

function stringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error(`${field} must be an array of at most 50 strings.`);
  }
  return value.map((entry, index) => {
    const parsed = boundedString(entry, `${field}[${index}]`, 128, {
      required: true,
    });
    if (!parsed) throw new Error(`${field}[${index}] is required.`);
    return parsed;
  });
}

function stringMetadata(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value) || Object.keys(value).length > 50) {
    throw new Error(
      "metadata must be an object with at most 50 string fields.",
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      const parsedKey = boundedString(key, "metadata key", 128, {
        required: true,
      });
      const parsedValue = boundedString(entry, `metadata.${key}`, 4_096, {
        required: true,
        multiline: true,
      });
      if (!parsedKey || !parsedValue) {
        throw new Error("metadata keys and values must be non-empty strings.");
      }
      return [parsedKey, parsedValue];
    }),
  );
}

function parseGuidedCodingLaunchBody(value: unknown): GuidedCodingLaunchBody {
  if (!isPlainObject(value)) throw new Error("A JSON object is required.");
  const unknownField = Object.keys(value).find(
    (field) => !GUIDED_CODING_FIELDS.has(field),
  );
  if (unknownField) throw new Error(`Unexpected field: ${unknownField}.`);

  const title = boundedString(value.title, "title", 200, { required: true });
  const objective = boundedString(value.objective, "objective", 20_000, {
    required: true,
    multiline: true,
  });
  const workspaceRoot = boundedString(
    value.workspaceRoot,
    "workspaceRoot",
    4_096,
    { required: true },
  );
  const branch = boundedString(value.branch, "branch", 512, {
    required: true,
  });
  const launchId = boundedString(value.launchId, "launchId", 128, {
    required: true,
  });
  if (!title || !objective || !workspaceRoot || !branch || !launchId) {
    throw new Error(
      "title, objective, workspaceRoot, branch, and launchId are required.",
    );
  }
  if (value.kind !== undefined && value.kind !== "coding") {
    throw new Error("Guided coding can only start coding tasks.");
  }
  if (
    value.capabilityProfile !== undefined &&
    value.capabilityProfile !== "coding"
  ) {
    throw new Error("Guided coding requires the coding capability.");
  }
  if (
    value.priority !== undefined &&
    !["low", "normal", "high"].includes(String(value.priority))
  ) {
    throw new Error("priority must be low, normal, or high.");
  }
  if (
    value.maxAttempts !== undefined &&
    (typeof value.maxAttempts !== "number" ||
      !Number.isInteger(value.maxAttempts) ||
      value.maxAttempts < 1 ||
      value.maxAttempts > 20)
  ) {
    throw new Error("maxAttempts must be an integer from 1 to 20.");
  }

  return {
    title,
    objective,
    workspaceRoot,
    branch,
    launchId,
    kind: "coding",
    capabilityProfile: "coding",
    profile: boundedString(value.profile, "profile", 128),
    framework: boundedString(value.framework, "framework", 128),
    accountId: boundedString(value.accountId, "accountId", 256),
    sessionId: boundedString(value.sessionId, "sessionId", 256),
    group: boundedString(value.group, "group", 128),
    priority: value.priority as GuidedCodingLaunchBody["priority"],
    tags: stringList(value.tags, "tags"),
    labels: stringList(value.labels, "labels"),
    metadata: stringMetadata(value.metadata),
    executionMode: "delegated",
    maxAttempts: value.maxAttempts as number | undefined,
  };
}

function toDelegationTaskInput(
  body: DelegationTaskBody,
  workspaceRoot?: string,
) {
  return {
    title: body.title,
    objective: body.objective,
    group: body.group,
    profile: body.profile,
    capabilityProfile: body.capabilityProfile,
    kind: body.kind,
    framework: body.framework,
    accountId: body.accountId,
    sessionId: body.sessionId,
    priority: body.priority,
    tags: body.tags ?? body.labels,
    labels: body.labels ?? body.tags,
    metadata: body.metadata,
    ...(workspaceRoot ? { workspaceRoot } : {}),
    executionMode: body.executionMode,
    maxAttempts: body.maxAttempts,
  };
}

async function resolveRequestedWorkspaceRoot(
  context: AppContext,
  body: DelegationTaskBody,
): Promise<string | undefined> {
  if (body.workspaceRoot === undefined) return undefined;
  return context.services.repository.resolveWorktreeRoot(body.workspaceRoot);
}

function guidedLaunchId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/u.test(value)
  ) {
    throw new Error("A stable launchId is required to start a coding task.");
  }
  return value;
}

async function resolveGuidedCodingWorkspace(
  context: AppContext,
  body: GuidedCodingLaunchBody,
): Promise<{ workspaceRoot: string; branch: string }> {
  const workspaceRoot = await resolveRequestedWorkspaceRoot(context, body);
  if (!workspaceRoot) {
    throw new Error("An isolated Git worktree is required to start coding.");
  }
  const repositoryRoot = (await context.services.repository.summary()).root;
  if (repositoryRoot === workspaceRoot) {
    throw new Error(
      "Guided coding cannot run in the repository's primary worktree.",
    );
  }
  const branch = body.branch.trim();
  if (!branch) {
    throw new Error(
      "The selected worktree branch is required to start coding.",
    );
  }
  const worktree = (
    await context.services.repository.worktrees({ fresh: true })
  ).find((candidate) => candidate.path === workspaceRoot);
  if (!worktree || worktree.detached || worktree.branch !== branch) {
    throw new Error(
      "The selected branch no longer matches the approved isolated worktree.",
    );
  }
  return { workspaceRoot, branch };
}

async function findGuidedCodingLaunch(context: AppContext, launchId: string) {
  const service = getOfficialOrchestrator(context.runtime);
  if (!service) return null;
  const tasks = await service.listTasks({ includeArchived: true });
  for (const candidate of tasks) {
    const detail = await service.getTask(candidate.id);
    if (detail?.metadata.guidedCodingLaunchId === launchId) return detail;
  }
  return null;
}

function requireMatchingGuidedCodingLaunch(
  existing: NonNullable<Awaited<ReturnType<typeof findGuidedCodingLaunch>>>,
  expected: {
    title: string;
    objective: string;
    workspaceRoot: string;
    branch: string;
  },
) {
  const metadata = existing.metadata;
  if (
    existing.title !== expected.title ||
    existing.goal !== expected.objective ||
    metadata.workspaceRoot !== expected.workspaceRoot ||
    metadata.guidedCodingBranch !== expected.branch
  ) {
    throw new Error(
      "launchId was already used for a different coding task or worktree.",
    );
  }
  return {
    workspaceRoot: expected.workspaceRoot,
    branch: expected.branch,
  };
}

async function startGuidedCodingTask(
  context: AppContext,
  body: GuidedCodingLaunchBody,
) {
  if (body.kind && body.kind !== "coding") {
    throw new Error("Guided coding can only start coding tasks.");
  }
  if (body.capabilityProfile && body.capabilityProfile !== "coding") {
    throw new Error("Guided coding requires the coding capability.");
  }
  const launchId = guidedLaunchId(body.launchId);
  const { workspaceRoot, branch } = await resolveGuidedCodingWorkspace(
    context,
    body,
  );
  const existing = await findGuidedCodingLaunch(context, launchId);
  const persisted = existing
    ? requireMatchingGuidedCodingLaunch(existing, {
        title: body.title,
        objective: body.objective,
        workspaceRoot,
        branch,
      })
    : { workspaceRoot, branch };
  const task = existing
    ? existing
    : await createEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
        {
          ...toDelegationTaskInput(body, workspaceRoot),
          title: body.title.trim(),
          objective: body.objective.trim(),
          kind: "coding",
          capabilityProfile: "coding",
          profile: "coding",
          executionMode: "delegated",
          metadata: {
            ...body.metadata,
            guidedCodingLaunchId: launchId,
            guidedCodingBranch: branch,
            guidedCodingReview: "repository-review",
          },
        },
      );
  const started =
    existing && existing.status !== "open"
      ? projectOfficialTask(existing)
      : await executeEffectiveDelegationTask(
          context.runtime,
          context.services.delegationProjection,
          task.id,
        );
  if (!started) {
    throw new Error("The coding task was created but could not be started.");
  }
  return {
    task: started,
    run: {
      taskId: started.id,
      sessionId: started.sessionId,
      workspaceRoot: persisted.workspaceRoot,
    },
    review: {
      taskId: started.id,
      workspaceRoot: persisted.workspaceRoot,
      branch: persisted.branch,
      tab: "review",
    },
  };
}

async function startGuidedCodingTaskSerialized(
  context: AppContext,
  body: GuidedCodingLaunchBody,
) {
  let launches = guidedCodingLaunches.get(context);
  if (!launches) {
    launches = new Map();
    guidedCodingLaunches.set(context, launches);
  }
  const fingerprint = JSON.stringify([
    body.title,
    body.objective,
    body.workspaceRoot,
    body.branch,
  ]);
  const active = launches.get(body.launchId);
  if (active) {
    if (active.fingerprint !== fingerprint) {
      throw new Error(
        "launchId is already starting a different coding task or worktree.",
      );
    }
    return active.promise;
  }
  const launch = startGuidedCodingTask(context, body);
  const entry = { fingerprint, promise: launch };
  launches.set(body.launchId, entry);
  try {
    return await launch;
  } finally {
    if (launches.get(body.launchId) === entry) launches.delete(body.launchId);
  }
}

export async function handleDelegationCommandRoutes(
  context: AppContext,
  request: Request,
  url: URL,
  options?: DelegationCommandRouteOptions,
): Promise<Response | null> {
  const runAgentTurn = options?.runAgentTurn ?? handleAgentTurn;

  if (
    url.pathname.startsWith("/delegation/") &&
    !getOfficialOrchestrator(context.runtime)
  ) {
    return json(
      {
        available: false,
        code: "ORCHESTRATOR_TASK_SERVICE_UNAVAILABLE",
        error:
          "Delegation is unavailable because the official orchestrator task service is not registered.",
      },
      503,
    );
  }

  if (request.method === "POST" && url.pathname === "/delegation/tasks") {
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as DelegationTaskBody;
    if (!body.title || !body.objective) {
      return json({ error: "title and objective are required" }, 400);
    }
    try {
      const workspaceRoot = await resolveRequestedWorkspaceRoot(context, body);
      return json({
        task: await createEffectiveDelegationTask(
          context.runtime,
          context.services.delegationProjection,
          toDelegationTaskInput(body, workspaceRoot) as Required<
            Pick<DelegationTaskBody, "title" | "objective">
          > &
            Omit<
              ReturnType<typeof toDelegationTaskInput>,
              "title" | "objective"
            >,
        ),
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Invalid worktree root",
        },
        400,
      );
    }
  }

  if (
    request.method === "POST" &&
    url.pathname === "/delegation/tasks/start-coding"
  ) {
    try {
      const parsed = await readBody(request);
      if ("response" in parsed) return parsed.response;
      const body = parseGuidedCodingLaunchBody(parsed.body);
      return json({
        launch: await startGuidedCodingTaskSerialized(context, body),
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to start coding task",
        },
        400,
      );
    }
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/delegation/tasks/") &&
    url.pathname.endsWith("/spawn")
  ) {
    const id = url.pathname.split("/")[3];
    if (!id) {
      return json({ error: "task id is required" }, 400);
    }

    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as DelegationTaskBody;
    if (!body.objective) {
      return json({ error: "objective is required" }, 400);
    }

    try {
      const workspaceRoot = await resolveRequestedWorkspaceRoot(context, body);
      return json({
        task: await spawnEffectiveDelegationChild(
          context.runtime,
          context.services.delegationProjection,
          id,
          {
            title: body.title ?? "Child task",
            objective: body.objective,
            group: body.group,
            profile: body.profile,
            capabilityProfile: body.capabilityProfile,
            kind: body.kind,
            framework: body.framework,
            accountId: body.accountId,
            sessionId: body.sessionId,
            priority: body.priority,
            tags: body.tags ?? body.labels,
            labels: body.labels ?? body.tags,
            metadata: body.metadata,
            ...(workspaceRoot ? { workspaceRoot } : {}),
            executionMode: body.executionMode,
            maxAttempts: body.maxAttempts,
          },
        ),
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Invalid worktree root",
        },
        400,
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/delegation/supervise") {
    await request.json().catch(() => ({}));
    const report = await superviseEffectiveDelegationQueue(context.runtime);
    return json({ report });
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/delegation/tasks/") &&
    url.pathname.endsWith("/execute")
  ) {
    const id = url.pathname.split("/")[3];
    if (!id) {
      return json({ error: "task id and action are required" }, 400);
    }
    const result = await runAgentTurn(
      {
        message: `/delegate execute ${id}`,
        userId: "api-delegation",
        roomId: "api-delegation",
        source: "api",
      },
      context,
    );
    return json({ result });
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/delegation/tasks/")
  ) {
    // Lifecycle mutations are handled by the next route handler. Keep this
    // command router focused on create, spawn, and execute operations.
    return null;
  }

  return null;
}
