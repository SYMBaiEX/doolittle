import { isRecord } from "@/utils/records";

const DEFAULT_CODEX_ACP_COMMAND =
  "npx -y @agentclientprotocol/codex-acp@1.13.1";

function usesAppServerAdapter(command: string): boolean {
  return /@agentclientprotocol\/codex-acp(?:[\s@"']|$)/u.test(command);
}

/**
 * beta.7's retired Zed adapter embeds an older Codex that rejects current
 * models. The maintained App Server adapter bundles compatible Codex and uses
 * CODEX_CONFIG, not -c. Preserve explicit legacy commands and their TOML argv.
 * Source: github.com/agentclientprotocol/codex-acp/tree/v1.13.1
 */
export function codexCommandForRoute(input: {
  command?: string;
  model: string;
  reasoningEffort?: string;
}): string {
  if (!/^[a-zA-Z0-9._:/-]+$/.test(input.model))
    throw new Error("CODING_MODEL_INVALID");
  if (
    input.reasoningEffort &&
    !["none", "minimal", "low", "medium", "high", "xhigh"].includes(
      input.reasoningEffort,
    )
  )
    throw new Error("CODING_REASONING_EFFORT_UNSUPPORTED");
  const command = input.command?.trim() || DEFAULT_CODEX_ACP_COMMAND;
  if (!/(?:^|[\s/@])codex-acp(?:[\s@"']|$)/u.test(command))
    throw new Error("CODING_CUSTOM_COMMAND_MODEL_UNSUPPORTED");
  if (usesAppServerAdapter(command)) return command;
  // The SDK splits command/argv without a shell. The validated TOML values
  // survive its supported tokenizer without changing the configured command.
  return `${command} -c 'model=${JSON.stringify(input.model)}'${input.reasoningEffort ? ` -c 'model_reasoning_effort=${JSON.stringify(input.reasoningEffort)}'` : ""}`;
}

/** Public spawnSession.env preserves the SDK's account selection and auth. */
export function codexSpawnEnvironmentForRoute(input: {
  command: string;
  model: string;
  reasoningEffort?: string;
  env?: Record<string, string>;
  approvalPreset?: string;
}): Record<string, string> | undefined {
  if (!usesAppServerAdapter(input.command)) return input.env;
  // Upstream's misleadingly named "read-only" mode is workspace-write with
  // user approvals. It cannot represent an actual deny-all/readonly policy.
  // CODEX_CONFIG.sandbox_mode cannot repair this: CodexAcpClient.sendPrompt
  // explicitly supplies the selected mode's sandboxPolicy on every turn.
  if (
    input.approvalPreset &&
    !["standard", "permissive", "autonomous"].includes(input.approvalPreset)
  )
    throw new Error("CODING_APPROVAL_POLICY_UNSUPPORTED");
  const rawConfig = input.env?.CODEX_CONFIG ?? process.env.CODEX_CONFIG;
  const config: unknown = rawConfig ? JSON.parse(rawConfig) : {};
  if (!isRecord(config)) throw new Error("CODING_MODEL_CONFIGURATION_INVALID");
  return {
    ...input.env,
    // Do not inherit the adapter's auto-review default or full-access mode.
    // The native SDK still owns every permission request from this process.
    INITIAL_AGENT_MODE: "read-only",
    CODEX_CONFIG: JSON.stringify({
      ...config,
      model: input.model,
      ...(input.reasoningEffort
        ? { model_reasoning_effort: input.reasoningEffort }
        : {}),
    }),
  };
}
