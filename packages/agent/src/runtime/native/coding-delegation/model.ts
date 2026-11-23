import { fileURLToPath } from "node:url";

const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"];

function commandToken(path: string): string {
  if (!/[\s"']/u.test(path)) return path;
  // Eliza's native ACP parser takes argv directly, without shell expansion.
  if (!path.includes('"')) return `"${path}"`;
  if (!path.includes("'")) return `'${path}'`;
  throw new Error("The bundled Codex ACP path contains unsupported quotes.");
}

/** The lockfile and signed desktop bundle own both adapter and Codex CLI. */
export function bundledCodexAcpCommand(): string {
  const adapter = fileURLToPath(
    import.meta.resolve("@agentclientprotocol/codex-acp"),
  );
  return [process.execPath, adapter].map(commandToken).join(" ");
}

/** Configure the bundled adapter without opening a second approval layer. */
export function bundledCodexAcpEnv(input: {
  model?: string;
  reasoningEffort?: string;
  env?: Record<string, string>;
  approvalPreset?: string;
}): Record<string, string> {
  const { model, reasoningEffort, approvalPreset, env } = input;
  if (model && !/^[a-zA-Z0-9._:/-]+$/u.test(model))
    throw new Error("CODING_MODEL_CONFIGURATION_INVALID");
  if (reasoningEffort && !EFFORTS.includes(reasoningEffort))
    throw new Error("CODING_MODEL_CONFIGURATION_INVALID");

  const readOnly =
    approvalPreset === "readonly" || approvalPreset === "verifier";
  return {
    ...env,
    // An empty override selects the adapter's own lockfile-pinned CLI.
    CODEX_PATH: "",
    CODEX_CONFIG: JSON.stringify({
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { model_reasoning_effort: reasoningEffort } : {}),
    }),
    INITIAL_AGENT_MODE: readOnly ? "read-only" : "workspace-write",
    ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
  };
}
