const DEFAULT_CODEX_ACP_COMMAND = "npx -y @zed-industries/codex-acp@0.14.0";

/**
 * beta.7 drops OPENAI_MODEL for subscription accounts and never sets the ACP
 * session model. codex-acp 0.14 accepts CliConfigOverrides (-c key=toml-value),
 * so pass model and effort to that process without mutating account config.
 * Source: github.com/zed-industries/codex-acp/blob/v0.14.0/src/lib.rs
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
  // The SDK splits command/argv without a shell. The validated TOML values
  // survive its supported tokenizer without changing the configured command.
  return `${command} -c 'model=${JSON.stringify(input.model)}'${input.reasoningEffort ? ` -c 'model_reasoning_effort=${JSON.stringify(input.reasoningEffort)}'` : ""}`;
}
