import {
  type CodingAgentContext,
  type ConnectorType,
  type InteractionMode,
  validateCodingAgentContext,
} from "@elizaos/agent/services/coding-agent-context";
import type { AppServices } from "@/services";
import {
  findLocalCodebases,
  inspectLocalProject,
  type LocalProjectInspection,
} from "@/services/project-inspection";
import { getNativeServices } from "../runtime";
import type {
  NativeCodingAgentService,
  NativeMcpService,
  NativeShellService,
  RuntimeLike,
} from "../runtime-contracts";

function getNativeShell(runtime: RuntimeLike): NativeShellService | undefined {
  return getNativeServices(runtime).shell as NativeShellService | undefined;
}

function getNativeMcp(runtime: RuntimeLike): NativeMcpService | undefined {
  return getNativeServices(runtime).mcp as NativeMcpService | undefined;
}

function getNativeCodingAgent(
  runtime: RuntimeLike,
): NativeCodingAgentService | undefined {
  return getNativeServices(runtime).codingAgent as
    | NativeCodingAgentService
    | undefined;
}

export async function runEffectiveShellCommand(
  runtime: RuntimeLike,
  services: AppServices,
  command: string,
) {
  return (
    (await getNativeShell(runtime)?.run(command)) ??
    (await getNativeCodingAgent(runtime)?.run(command)) ??
    services.terminal.run(command)
  );
}

export function getEffectiveMcpStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return getNativeMcp(runtime)?.status() ?? services.mcp.status();
}

export async function probeEffectiveMcp(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (await getNativeMcp(runtime)?.probe()) ?? services.mcp.probe();
}

export async function discoverEffectiveMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeMcp(runtime)?.discoverTools()) ??
    services.mcp.discoverTools()
  );
}

export function getEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeMcp(runtime)?.getCachedTools() ?? services.mcp.getCachedTools()
  );
}

export function searchEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
) {
  return (
    getNativeMcp(runtime)?.searchCachedTools(query) ??
    services.mcp.searchCachedTools(query)
  );
}

export function describeEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 20,
) {
  return (
    getNativeMcp(runtime)?.describeCachedTools(limit) ??
    services.mcp.describeCachedTools(limit)
  );
}

export function describeEffectiveMcpTool(
  runtime: RuntimeLike,
  services: AppServices,
  name: string,
) {
  return (
    getNativeMcp(runtime)?.describeTool(name) ?? services.mcp.describeTool(name)
  );
}

export async function invokeEffectiveMcp(
  runtime: RuntimeLike,
  services: AppServices,
  input: string,
) {
  return (
    (await getNativeMcp(runtime)?.invoke(input)) ?? services.mcp.invoke(input)
  );
}

export async function invokeEffectiveMcpTool(
  runtime: RuntimeLike,
  services: AppServices,
  name: string,
  input: Record<string, unknown>,
) {
  return (
    (await getNativeMcp(runtime)?.invokeTool(name, input)) ??
    services.mcp.invokeTool(name, input)
  );
}

export function getEffectiveShellHistory(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 10,
): unknown[] {
  return (
    getNativeShell(runtime)?.history(limit) ?? services.terminal.recent(limit)
  );
}

export async function getEffectiveShellStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeShell(runtime)?.status()) ?? services.terminal.status()
  );
}

export function readEffectiveWorkspaceFile(
  runtime: RuntimeLike,
  services: AppServices,
  path: string,
) {
  return (
    getNativeCodingAgent(runtime)?.read(path) ?? services.workspace.read(path)
  );
}

export function searchEffectiveWorkspace(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 20,
) {
  return (
    getNativeCodingAgent(runtime)?.search(query, limit) ??
    services.workspace.search(query, limit)
  );
}

export function writeEffectiveWorkspaceFile(
  runtime: RuntimeLike,
  services: AppServices,
  path: string,
  content: string,
) {
  return (
    getNativeCodingAgent(runtime)?.write(path, content) ??
    services.workspace.write(path, content)
  );
}

export function getEffectiveCodingAgentContext(
  runtime: RuntimeLike,
  services: AppServices,
  input: {
    sessionId: string;
    taskDescription: string;
    workspaceRoot: string;
    maxIterations?: number;
    interactionMode?: InteractionMode;
    connectorType?: ConnectorType;
    metadata?: Record<string, string>;
  },
): CodingAgentContext {
  const nativeContext = getNativeCodingAgent(runtime)?.context?.(
    input.taskDescription,
    {
      sessionId: input.sessionId,
      workingDirectory: input.workspaceRoot,
      maxIterations: input.maxIterations,
      interactionMode: input.interactionMode,
      connectorType: input.connectorType,
      metadata: input.metadata,
    },
  );
  if (nativeContext) {
    return nativeContext as CodingAgentContext;
  }

  const candidate = {
    sessionId: input.sessionId,
    taskDescription: input.taskDescription,
    workingDirectory: input.workspaceRoot,
    connector: {
      type:
        input.connectorType ??
        (services.repository.isRepository() ? "git-repo" : "local-fs"),
      basePath: input.workspaceRoot,
      available: true,
      metadata: input.metadata,
    },
    interactionMode: input.interactionMode ?? "human-in-the-loop",
    maxIterations: input.maxIterations ?? 8,
    active: true,
    iterations: [],
    allFeedback: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } satisfies Record<string, unknown>;

  const validated = validateCodingAgentContext(candidate);
  if (!validated.ok) {
    throw new Error(
      `Invalid effective coding agent context: ${validated.errors
        .map((entry) => `${entry.path}: ${entry.message}`)
        .join(", ")}`,
    );
  }
  return validated.data;
}

export async function inspectEffectiveProject(
  runtime: RuntimeLike,
  _services: AppServices,
  projectPath: string,
): Promise<LocalProjectInspection> {
  const nativeInspection =
    await getNativeCodingAgent(runtime)?.inspectProject?.(projectPath);
  if (nativeInspection) {
    return nativeInspection as LocalProjectInspection;
  }
  return inspectLocalProject(projectPath);
}

export async function findEffectiveLocalCodebases(
  _runtime: RuntimeLike,
  services: AppServices,
  query: string,
) {
  return findLocalCodebases(query, services.workspace.root());
}

export async function getEffectiveRepositoryStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeCodingAgent(runtime)?.repoStatus()) ??
    services.repository.status()
  );
}

export async function getEffectiveRepositoryDiff(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeCodingAgent(runtime)?.repoDiff()) ??
    services.repository.diffStat()
  );
}

export async function getEffectiveRepositoryLog(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 10,
) {
  return (
    (await getNativeCodingAgent(runtime)?.repoLog(limit)) ??
    services.repository.recentCommits(limit)
  );
}
