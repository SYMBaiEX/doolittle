export type ConnectorType = "local-fs" | "git-repo" | (string & {});

export type InteractionMode =
  | "human-in-the-loop"
  | "autonomous"
  | (string & {});

export interface FileOperation {
  type: "read" | "write" | "edit" | "list" | "search";
  target: string;
  size?: number;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executedIn?: string;
  durationMs?: number;
  success: boolean;
}

export interface CodingIterationError {
  category: string;
  message: string;
  raw?: string;
}

export interface HumanFeedback {
  id: string;
  timestamp: number;
  text: string;
  iterationRef?: number;
  type: "correction" | "guidance" | "approval" | "rejection";
}

export interface CodingIteration {
  index: number;
  startedAt: number;
  completedAt?: number;
  generatedCode?: string;
  fileOperations: FileOperation[];
  commandResults: CommandResult[];
  errors: CodingIterationError[];
  feedback: HumanFeedback[];
  selfCorrected: boolean;
  summary?: string;
}

export interface CodingAgentContext {
  sessionId: string;
  taskDescription: string;
  workingDirectory: string;
  connector: {
    type: ConnectorType;
    basePath: string;
    available: boolean;
    metadata: Record<string, string>;
  };
  interactionMode: InteractionMode;
  maxIterations: number;
  active: boolean;
  iterations: CodingIteration[];
  allFeedback: HumanFeedback[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateCodingAgentContextInput {
  sessionId: string;
  taskDescription: string;
  workingDirectory: string;
  connectorBasePath: string;
  connectorType: ConnectorType;
  interactionMode: InteractionMode;
  maxIterations: number;
}

type ValidationError = {
  path: string;
  message: string;
};

type ValidationResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      errors: ValidationError[];
    };

function ok<T>(data: T): ValidationResult<T> {
  return { ok: true, data };
}

function fail<T>(errors: ValidationError[]): ValidationResult<T> {
  return { ok: false, errors };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeFeedback(
  input: HumanFeedback[],
  iterationIndex?: number,
): HumanFeedback[] {
  return input.map((entry) => ({
    ...entry,
    iterationRef: entry.iterationRef ?? iterationIndex,
  }));
}

export function createCodingAgentContext(
  input: CreateCodingAgentContextInput,
): CodingAgentContext {
  const now = Date.now();
  return {
    sessionId: input.sessionId,
    taskDescription: input.taskDescription,
    workingDirectory: input.workingDirectory,
    connector: {
      type: input.connectorType,
      basePath: input.connectorBasePath,
      available: true,
      metadata: {},
    },
    interactionMode: input.interactionMode,
    maxIterations: input.maxIterations,
    active: true,
    iterations: [],
    allFeedback: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addIteration(
  context: CodingAgentContext,
  iteration: CodingIteration,
): CodingAgentContext {
  return {
    ...context,
    iterations: [...context.iterations, iteration],
    updatedAt: Date.now(),
  };
}

export function injectFeedback(
  context: CodingAgentContext,
  feedback: HumanFeedback,
): CodingAgentContext {
  return {
    ...context,
    allFeedback: [...context.allFeedback, feedback],
    updatedAt: Date.now(),
  };
}

export function validateCodingIteration(
  value: Record<string, unknown>,
): ValidationResult<CodingIteration> {
  const errors: ValidationError[] = [];

  if (!isFiniteNumber(value.index)) {
    errors.push({ path: "index", message: "Expected a finite number." });
  }
  if (!isFiniteNumber(value.startedAt)) {
    errors.push({ path: "startedAt", message: "Expected a finite number." });
  }
  if (
    typeof value.completedAt !== "undefined" &&
    !isFiniteNumber(value.completedAt)
  ) {
    errors.push({
      path: "completedAt",
      message: "Expected a finite number when present.",
    });
  }
  if (!Array.isArray(value.fileOperations)) {
    errors.push({
      path: "fileOperations",
      message: "Expected an array of file operations.",
    });
  }
  if (!Array.isArray(value.commandResults)) {
    errors.push({
      path: "commandResults",
      message: "Expected an array of command results.",
    });
  }
  if (!Array.isArray(value.errors)) {
    errors.push({ path: "errors", message: "Expected an array of errors." });
  }
  if (!Array.isArray(value.feedback)) {
    errors.push({
      path: "feedback",
      message: "Expected an array of feedback entries.",
    });
  }
  if (typeof value.selfCorrected !== "boolean") {
    errors.push({
      path: "selfCorrected",
      message: "Expected a boolean flag.",
    });
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    index: value.index as number,
    startedAt: value.startedAt as number,
    completedAt: value.completedAt as number | undefined,
    generatedCode: value.generatedCode as string | undefined,
    fileOperations: (value.fileOperations as FileOperation[]) ?? [],
    commandResults: (value.commandResults as CommandResult[]) ?? [],
    errors: (value.errors as CodingIterationError[]) ?? [],
    feedback: normalizeFeedback(
      (value.feedback as HumanFeedback[]) ?? [],
      value.index as number,
    ),
    selfCorrected: value.selfCorrected as boolean,
    summary: value.summary as string | undefined,
  });
}

export function validateCodingAgentContext(
  value: CodingAgentContext,
): ValidationResult<CodingAgentContext> {
  const errors: ValidationError[] = [];

  if (!isNonEmptyString(value.sessionId)) {
    errors.push({ path: "sessionId", message: "Expected a session id." });
  }
  if (!isNonEmptyString(value.taskDescription)) {
    errors.push({
      path: "taskDescription",
      message: "Expected a task description.",
    });
  }
  if (!isNonEmptyString(value.workingDirectory)) {
    errors.push({
      path: "workingDirectory",
      message: "Expected a working directory.",
    });
  }
  if (!isNonEmptyString(value.connector?.basePath)) {
    errors.push({
      path: "connector.basePath",
      message: "Expected a connector base path.",
    });
  }
  if (!isNonEmptyString(value.connector?.type)) {
    errors.push({
      path: "connector.type",
      message: "Expected a connector type.",
    });
  }
  if (typeof value.connector?.available !== "boolean") {
    errors.push({
      path: "connector.available",
      message: "Expected a connector availability flag.",
    });
  }
  if (!isFiniteNumber(value.maxIterations) || value.maxIterations <= 0) {
    errors.push({
      path: "maxIterations",
      message: "Expected a positive finite number.",
    });
  }
  if (!Array.isArray(value.iterations)) {
    errors.push({
      path: "iterations",
      message: "Expected an array of iterations.",
    });
  }
  if (!Array.isArray(value.allFeedback)) {
    errors.push({
      path: "allFeedback",
      message: "Expected an array of feedback entries.",
    });
  }

  const iterationErrors = (value.iterations ?? []).flatMap((entry, index) => {
    const validation = validateCodingIteration(
      entry as unknown as Record<string, unknown>,
    );
    return validation.ok
      ? []
      : validation.errors.map((error) => ({
          path: `iterations[${index}].${error.path}`,
          message: error.message,
        }));
  });
  errors.push(...iterationErrors);

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    ...value,
    connector: {
      ...value.connector,
      metadata: value.connector.metadata ?? {},
    },
    allFeedback: normalizeFeedback(value.allFeedback),
  });
}
