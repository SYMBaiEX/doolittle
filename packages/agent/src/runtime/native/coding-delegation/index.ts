import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
  Plugin,
} from "@elizaos/core";
import { buildActionResultData } from "@/runtime/action-result-metadata";
import { buildCacheablePrompt } from "@/runtime/prompt-cache";
import {
  getScopedTurnAbortSignal,
  recordScopedTurnActionResult,
  runWithAdditionalTurnRuntimeSettings,
} from "@/runtime/turn-runtime-scope";
import { isRecord } from "@/utils/records";
import {
  delegationFailureMessage,
  executeManagedDelegation,
} from "./execution";
import { codexCommandForRoute, codexSpawnEnvironmentForRoute } from "./model";
import type {
  CodingDelegationServices,
  DelegatedExecutionReceipt,
  ManagedAcpService,
} from "./types";

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function userRequest(runtime: IAgentRuntime, message: Memory): string {
  const outer: unknown = message.metadata;
  const metadata =
    isRecord(outer) && isRecord(outer.doolittle) ? outer.doolittle : {};
  return (
    string(runtime.getSetting("DOOLITTLE_CODING_REQUEST_TEXT")) ??
    string(metadata.rawMessage) ??
    string(message.content.text) ??
    ""
  );
}

function modelRoute(runtime: IAgentRuntime): {
  provider?: string;
  model?: string;
  reasoningEffort?: string;
} {
  try {
    const raw = runtime.getSetting("runtimeSettings");
    const settings = typeof raw === "string" ? JSON.parse(raw) : raw;
    return isRecord(settings) && isRecord(settings.model)
      ? {
          provider: string(settings.model.provider),
          model: string(settings.model.model),
          reasoningEffort: string(settings.model.reasoningEffort),
        }
      : {};
  } catch {
    return {};
  }
}

/** Planner guesses must not override a user's selected account/provider. */
export function resolveDelegationAdapter(
  request: string,
  provider?: string,
): string | undefined {
  const directive = [
    ...request.matchAll(
      /\b(?:use|using|with|via|through|delegate\s+to|ask)\s+(?:the\s+)?(claude(?:\s+code)?|codex|opencode|pi-agent|elizaos)\b/gi,
    ),
  ].find(
    (match) =>
      !/(?:\b(?:do\s+not|don['’]t|never|avoid|not)\s*)$/i.test(
        request.slice(0, match.index),
      ),
  );
  const explicit = directive?.[1]?.toLowerCase();
  if (explicit) return explicit.startsWith("claude") ? "claude" : explicit;
  return provider === "codex"
    ? "codex"
    : provider === "claude-code" || provider === "anthropic"
      ? "claude"
      : undefined;
}

function failure(message: string, code: string): ActionResult {
  return {
    success: false,
    text: message,
    userFacingText: message,
    verifiedUserFacing: true,
    error: code,
    continueChain: true,
    data: {
      actionName: "TASKS_SPAWN_AGENT",
      userFacingText: message,
      verifiedUserFacing: true,
      delegatedExecution: {
        status: "failed",
        failureMessage: message,
        verifiedLocalMutation: false,
      },
    },
  };
}

function completion(receipt: DelegatedExecutionReceipt): ActionResult {
  const success = receipt.status === "completed";
  const changed = receipt.changedFiles[0];
  const summary = success
    ? `The ${receipt.agentType} coding agent finished its turn in ${receipt.workdir}. ${receipt.changedFiles.length} file change(s) were verified against pre-run fingerprints. Verify the requested build and application handoff before claiming the user's task is complete.${receipt.summary ? `\n\nAgent report:\n${receipt.summary}` : "\nThe coding agent supplied no final response; inspect its outputs before replying."}`
    : (receipt.failureMessage ?? "The coding agent did not complete the task.");
  return {
    success,
    text: summary,
    ...(receipt.failureMessage
      ? { userFacingText: receipt.failureMessage, verifiedUserFacing: true }
      : {}),
    ...(success ? {} : { error: receipt.failureMessage }),
    continueChain: true,
    data: buildActionResultData(
      changed
        ? {
            mutation: {
              action: "TASKS_SPAWN_AGENT",
              requestedPath: receipt.workdir,
              resolvedPath: changed.path,
              success: true,
              bytes: changed.bytes,
              message:
                "Verified delegated file change with before/after SHA-256 fingerprints.",
            },
            fileOperation: {
              type: "write",
              target: changed.path,
              size: changed.bytes,
            },
          }
        : {},
      {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: receipt,
        ...(receipt.failureMessage
          ? { userFacingText: receipt.failureMessage, verifiedUserFacing: true }
          : {}),
      },
    ),
  };
}

function wrapAction(
  action: Action,
  services: CodingDelegationServices,
  promotedOperation?: "spawn_agent",
): Action {
  const handler = action.handler;
  const managedSpawnDescription =
    action.name === "TASKS_SPAWN_AGENT"
      ? "For a user-requested coding implementation, delegate the complete task to the configured coding adapter in the exact requested existing workspace. Include the user's full requirements in task and the resolved absolute directory in workdir; do not substitute the selected project root. Wait for the coding run to finish before returning."
      : undefined;
  return {
    ...action,
    ...(managedSpawnDescription
      ? {
          description:
            `${action.description ?? ""} ${managedSpawnDescription}`.trim(),
          descriptionCompressed: managedSpawnDescription,
        }
      : {}),
    handler: async (runtime, message, state, options, callback) => {
      const passthrough = async () => {
        const result = await handler(
          runtime,
          message,
          state,
          options,
          callback,
        );
        return result;
      };
      const parameters = isRecord(options?.parameters)
        ? options.parameters
        : {};
      const operation =
        promotedOperation ??
        string(
          parameters.action ??
            parameters.op ??
            parameters.subaction ??
            parameters.operation,
        ) ??
        "create";
      const run = services.runController.getByRoomId(String(message.roomId));
      if (
        !run ||
        !["desktop", "cli", "api"].includes(run.source) ||
        !["spawn_agent", "create"].includes(operation)
      )
        return passthrough();
      // Keep multi-agent create on its official synchronous runner. The failing
      // single-session spawn is the only detached SDK path adapted here.
      if (operation !== "spawn_agent") return passthrough();
      const workdirInput =
        string(parameters.workdir ?? message.content.workdir) ??
        services.workspace.root();
      const expanded = workdirInput.startsWith("~/")
        ? resolve(homedir(), workdirInput.slice(2))
        : workdirInput;
      if (!isAbsolute(expanded))
        return failure(
          `The coding workspace must be an absolute path, not “${workdirInput}”. Resolve the user's intended directory before delegating.`,
          "WORKSPACE_PATH_AMBIGUOUS",
        );
      const workdir = resolve(expanded);
      if (!(await stat(workdir).catch(() => null))?.isDirectory())
        return failure(
          `The coding workspace does not exist: ${workdir}. Inspect the intended location and create this exact directory with the workspace tool if the user requested it, then retry. No fallback directory was used.`,
          "WORKSPACE_NOT_FOUND",
        );
      const route = modelRoute(runtime);
      const adapter =
        resolveDelegationAdapter(
          userRequest(runtime, message),
          route.provider,
        ) ?? string(parameters.agentType);
      const service = (runtime.getService("ACP_SERVICE") ??
        runtime.getService("ACP_SUBPROCESS_SERVICE")) as unknown as
        | ManagedAcpService
        | undefined;
      if (
        !service ||
        typeof service.sendPrompt !== "function" ||
        typeof service.onSessionEvent !== "function"
      )
        return failure(
          "The coding-agent service is unavailable. Restart the runtime and check Settings → Providers & accounts before retrying.",
          "CODING_SERVICE_UNAVAILABLE",
        );
      let receipt: DelegatedExecutionReceipt | undefined;
      const signal = getScopedTurnAbortSignal(runtime);
      const scopedSettings = new Map<string, unknown>();
      if (adapter === "codex" && route.provider === "codex" && route.model) {
        try {
          scopedSettings.set(
            "ELIZA_CODEX_ACP_COMMAND",
            codexCommandForRoute({
              command: string(runtime.getSetting("ELIZA_CODEX_ACP_COMMAND")),
              model: route.model,
              reasoningEffort: route.reasoningEffort,
            }),
          );
        } catch {
          return failure(
            "The selected model or reasoning effort cannot be passed to this coding adapter. Review the Codex model and custom ACP command in Settings, then retry; the default model was not substituted.",
            "CODING_MODEL_CONFIGURATION_INVALID",
          );
        }
      }
      const managedService = new Proxy(service, {
        get(target, key) {
          if (key === "spawnSession")
            return async (
              spawnOptions: Parameters<ManagedAcpService["spawnSession"]>[0],
            ) => {
              if (resolve(spawnOptions.workdir ?? "") !== workdir)
                throw new Error("CODING_WORKSPACE_MISMATCH");
              const task = buildCacheablePrompt({
                provider: adapter,
                model: route.model,
                versionDigest: "doolittle-managed-coding-v1",
                conversationId: String(message.roomId),
                stableBlocks: [
                  "Implement the assigned coding work and verify it before returning. Preserve all explicit user requirements: do not replace requested libraries with look-alike components or silently change the target directory. Inspect existing files and preserve unrelated changes. Report actual test/build commands and outcomes; never claim success from preliminary commands alone. If an application must remain running, prepare and verify its development script, then give the parent the exact working directory and command so it can launch a tracked process using DOOLITTLE_APP_SERVER. Do not leave an untracked background server running from the worker. Package managers and development bundlers are distinct; use each framework's supported development tooling.",
                ],
                volatile: `Original user requirements:\n${userRequest(runtime, message)}\n\nAssigned worker task and workspace context:\n${spawnOptions.initialTask ?? ""}`,
              }).prompt;
              const result = await executeManagedDelegation({
                service,
                options: {
                  ...spawnOptions,
                  env:
                    adapter === "codex" &&
                    route.provider === "codex" &&
                    route.model
                      ? codexSpawnEnvironmentForRoute({
                          command: String(
                            scopedSettings.get("ELIZA_CODEX_ACP_COMMAND"),
                          ),
                          model: route.model,
                          reasoningEffort: route.reasoningEffort,
                          env: spawnOptions.env,
                          approvalPreset:
                            spawnOptions.approvalPreset ??
                            service.defaultApprovalPreset,
                        })
                      : spawnOptions.env,
                  initialTask: task,
                  workdir,
                  isolateWorkdir: false,
                },
                model:
                  (adapter === "codex" && route.provider === "codex") ||
                  (adapter === "claude" &&
                    ["claude-code", "anthropic"].includes(route.provider ?? ""))
                    ? route.model
                    : undefined,
                roomId: String(message.roomId),
                services,
                signal,
              });
              receipt = result.receipt;
              return result.session;
            };
          const value = Reflect.get(target, key);
          if (key === "listSessions" && typeof value === "function")
            return (...args: unknown[]) => {
              signal?.throwIfAborted();
              return value.apply(target, args);
            };
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const scopedRuntime = new Proxy(runtime, {
        get(target, key) {
          if (key === "getService")
            return (name: string) =>
              ["ACP_SERVICE", "ACP_SUBPROCESS_SERVICE"].includes(name)
                ? managedService
                : target.getService(name);
          if (key === "getSetting")
            return (name: string) =>
              adapter &&
              [
                "ELIZA_ACP_DEFAULT_AGENT",
                "ELIZA_DEFAULT_AGENT_TYPE",
                "BENCHMARK_TASK_AGENT",
              ].includes(name)
                ? adapter
                : name === "ELIZA_AGENT_SELECTION_STRATEGY"
                  ? "fixed"
                  : target.getSetting(name);
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const result = await runWithAdditionalTurnRuntimeSettings(
        runtime,
        scopedSettings,
        () =>
          handler(
            scopedRuntime,
            message,
            state,
            {
              ...options,
              parameters: {
                ...parameters,
                workdir,
                lockWorkdir: true,
                ...(adapter ? { agentType: adapter } : {}),
              },
            },
            undefined,
          ),
      );
      if (receipt) {
        const result = completion(receipt);
        recordScopedTurnActionResult(runtime, result);
        return result;
      }
      if (result && typeof result === "object" && result.success === false)
        return failure(
          delegationFailureMessage(
            adapter ?? "Coding agent",
            string(result.error) ?? string(result.text) ?? "spawn failed",
          ),
          "CODING_AGENT_LAUNCH_FAILED",
        );
      return result;
    },
  };
}

/** Preserve SDK plugin/service authority while owning local coding turns. */
export function withManagedCodingDelegation(
  plugin: Plugin,
  services: CodingDelegationServices,
): Plugin {
  return {
    ...plugin,
    actions: plugin.actions?.map((action) => {
      // SDK virtual handlers inject the discriminator only when invoked, after
      // this boundary. Their fixed operation must not depend on caller params.
      if (action.name === "TASKS_SPAWN_AGENT")
        return wrapAction(action, services, "spawn_agent");
      return action.name === "TASKS" ? wrapAction(action, services) : action;
    }),
  };
}
