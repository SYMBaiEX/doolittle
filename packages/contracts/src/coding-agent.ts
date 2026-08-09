import { z } from "zod";

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

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult<T> =
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

const nonEmptyString = z.string().refine((value) => value.trim().length > 0, {
  message: "Expected a non-empty string.",
});
const finiteNumber = z.number().finite();
const feedbackSchema = z
  .object({
    id: z.string(),
    timestamp: finiteNumber,
    text: z.string(),
    iterationRef: finiteNumber.optional(),
    type: z.enum(["correction", "guidance", "approval", "rejection"]),
  })
  .passthrough();
const codingIterationSchema = z
  .object({
    index: finiteNumber,
    startedAt: finiteNumber,
    completedAt: finiteNumber.optional(),
    generatedCode: z.string().optional(),
    fileOperations: z.array(
      z
        .object({
          type: z.enum(["read", "write", "edit", "list", "search"]),
          target: z.string(),
          size: finiteNumber.optional(),
        })
        .passthrough(),
    ),
    commandResults: z.array(
      z
        .object({
          command: z.string(),
          exitCode: finiteNumber,
          stdout: z.string(),
          stderr: z.string(),
          executedIn: z.string().optional(),
          durationMs: finiteNumber.optional(),
          success: z.boolean(),
        })
        .passthrough(),
    ),
    errors: z.array(
      z
        .object({
          category: z.string(),
          message: z.string(),
          raw: z.string().optional(),
        })
        .passthrough(),
    ),
    feedback: z.array(feedbackSchema),
    selfCorrected: z.boolean(),
    summary: z.string().optional(),
  })
  .passthrough();
const codingAgentContextSchema = z
  .object({
    sessionId: nonEmptyString,
    taskDescription: nonEmptyString,
    workingDirectory: nonEmptyString,
    connector: z
      .object({
        type: nonEmptyString,
        basePath: nonEmptyString,
        available: z.boolean(),
        metadata: z.record(z.string(), z.string()).default({}),
      })
      .passthrough(),
    interactionMode: nonEmptyString,
    maxIterations: finiteNumber.positive(),
    active: z.boolean(),
    iterations: z.array(codingIterationSchema),
    allFeedback: z.array(feedbackSchema),
    createdAt: finiteNumber,
    updatedAt: finiteNumber,
  })
  .passthrough();

function issuePath(path: PropertyKey[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    return result ? `${result}.${String(segment)}` : String(segment);
  }, "");
}

function validationErrors(error: z.ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    path: issuePath(issue.path),
    message: issue.message,
  }));
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
  value: unknown,
): ValidationResult<CodingIteration> {
  const parsed = codingIterationSchema.safeParse(value);
  if (!parsed.success) return fail(validationErrors(parsed.error));
  const iteration: CodingIteration = {
    ...parsed.data,
    feedback: normalizeFeedback(parsed.data.feedback, parsed.data.index),
  };
  return ok(iteration);
}

export function validateCodingAgentContext(
  value: unknown,
): ValidationResult<CodingAgentContext> {
  const parsed = codingAgentContextSchema.safeParse(value);
  if (!parsed.success) return fail(validationErrors(parsed.error));
  const context: CodingAgentContext = {
    ...parsed.data,
    iterations: parsed.data.iterations.map((iteration) => ({
      ...iteration,
      feedback: normalizeFeedback(iteration.feedback, iteration.index),
    })),
    allFeedback: normalizeFeedback(parsed.data.allFeedback),
  };
  return ok(context);
}
