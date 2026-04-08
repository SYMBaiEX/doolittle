import type {
  ParsedRuntimeSettings,
  RuntimeSettings,
} from "@/services/settings/runtime-settings";

export interface RuntimeSettingsNormalizationResult {
  dirty: boolean;
  settings: RuntimeSettings;
}

function assignWhenUndefined<T extends object, K extends keyof T>(
  target: T,
  defaults: T,
  key: K,
): boolean {
  if (target[key] === undefined) {
    target[key] = defaults[key];
    return true;
  }
  return false;
}

function assignArrayWhenMissingOrEmpty<T extends object, K extends keyof T>(
  target: T,
  defaults: T,
  key: K,
): boolean {
  const value = target[key];
  if (!Array.isArray(value) || value.length === 0) {
    target[key] = defaults[key];
    return true;
  }
  return false;
}

function normalizeExecutionSettings(
  parsed: ParsedRuntimeSettings,
  defaults: RuntimeSettings,
): boolean {
  let dirty = false;
  const execution = parsed.execution;
  if (!execution) {
    parsed.execution = { ...defaults.execution };
    return true;
  }

  dirty =
    assignWhenUndefined(execution, defaults.execution, "remoteSyncMode") ||
    dirty;
  dirty =
    assignArrayWhenMissingOrEmpty(
      execution,
      defaults.execution,
      "remoteSyncInclude",
    ) || dirty;
  dirty =
    assignArrayWhenMissingOrEmpty(
      execution,
      defaults.execution,
      "remoteSyncExclude",
    ) || dirty;
  dirty =
    assignArrayWhenMissingOrEmpty(
      execution,
      defaults.execution,
      "remoteArtifactPaths",
    ) || dirty;
  dirty =
    assignWhenUndefined(
      execution,
      defaults.execution,
      "remoteArtifactPolicy",
    ) || dirty;
  dirty =
    assignWhenUndefined(
      execution,
      defaults.execution,
      "remoteWorkspaceLabel",
    ) || dirty;
  dirty =
    assignWhenUndefined(execution, defaults.execution, "dockerNetwork") ||
    dirty;
  dirty =
    assignWhenUndefined(execution, defaults.execution, "dockerWorkspacePath") ||
    dirty;
  dirty =
    assignArrayWhenMissingOrEmpty(
      execution,
      defaults.execution,
      "dockerEnvPassthrough",
    ) || dirty;

  const passthroughKeys: Array<keyof RuntimeSettings["execution"]> = [
    "singularityImage",
    "daytonaTarget",
    "daytonaCommand",
    "daytonaShell",
    "daytonaWorkspacePath",
    "daytonaSnapshot",
    "daytonaBootstrapCommand",
    "daytonaStatusCommand",
    "daytonaInspectCommand",
    "modalTarget",
    "modalCommand",
    "modalShell",
    "modalWorkspacePath",
    "modalEnvironment",
    "modalBootstrapCommand",
    "modalStatusCommand",
    "modalInspectCommand",
    "commandTimeoutMs",
    "healthTimeoutMs",
    "containerCpuLimit",
    "containerMemoryLimit",
    "containerPidsLimit",
    "containerReadOnlyRoot",
    "sshHost",
    "sshUser",
    "sshPath",
    "sshPort",
    "sshKeyPath",
    "sshStrictHostKeyChecking",
  ];

  for (const key of passthroughKeys) {
    dirty = assignWhenUndefined(execution, defaults.execution, key) || dirty;
  }

  return dirty;
}

function normalizeMcpSettings(
  parsed: ParsedRuntimeSettings,
  defaults: RuntimeSettings,
): boolean {
  let dirty = false;
  if (!parsed.mcp) {
    parsed.mcp = { ...defaults.mcp };
    return true;
  }
  dirty =
    assignWhenUndefined(parsed.mcp, defaults.mcp, "serverCommand") || dirty;
  dirty = assignWhenUndefined(parsed.mcp, defaults.mcp, "timeoutMs") || dirty;
  return dirty;
}

function normalizeAgentSettings(
  parsed: ParsedRuntimeSettings,
  defaults: RuntimeSettings,
): boolean {
  let dirty = false;
  if (!parsed.agent || typeof parsed.agent !== "object") {
    parsed.agent = { ...defaults.agent };
    return true;
  }
  dirty =
    assignWhenUndefined(parsed.agent, defaults.agent, "runDepth") || dirty;
  dirty =
    assignWhenUndefined(parsed.agent, defaults.agent, "maxIterations") || dirty;
  dirty =
    assignWhenUndefined(parsed.agent, defaults.agent, "toolProgressMode") ||
    dirty;
  return dirty;
}

function normalizeUiSettings(
  parsed: ParsedRuntimeSettings,
  defaults: RuntimeSettings,
): boolean {
  if (!parsed.ui || typeof parsed.ui !== "object") {
    parsed.ui = { ...defaults.ui };
    return true;
  }
  return assignWhenUndefined(parsed.ui, defaults.ui, "theme");
}

export function normalizeRuntimeSettings(
  parsed: ParsedRuntimeSettings,
  defaults: RuntimeSettings,
): RuntimeSettingsNormalizationResult {
  let dirty = false;

  if (parsed.model.provider === "openai-compatible") {
    parsed.model.provider = "openai";
    dirty = true;
  }

  dirty = normalizeExecutionSettings(parsed, defaults) || dirty;
  dirty = normalizeMcpSettings(parsed, defaults) || dirty;
  dirty = normalizeAgentSettings(parsed, defaults) || dirty;
  dirty = normalizeUiSettings(parsed, defaults) || dirty;

  return {
    dirty,
    settings: parsed as RuntimeSettings,
  };
}
