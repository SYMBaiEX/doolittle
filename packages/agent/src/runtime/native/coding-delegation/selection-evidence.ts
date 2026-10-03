import { createHash } from "node:crypto";
import type { AcpSession, DelegatedInitialSelectionEvidence } from "./types";

const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
type Effort = (typeof EFFORTS)[number];
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const model = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 160 &&
  /^[a-zA-Z0-9._:/-]+$/u.test(value);
const effort = (value: unknown): value is Effort =>
  typeof value === "string" && EFFORTS.includes(value as Effort);

/** Read only own data fields: injected accessors must not run or leak errors. */
function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  try {
    const fields: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(value),
    )) {
      if (!("value" in descriptor)) return;
      fields[key] = descriptor.value;
    }
    return fields;
  } catch {
    return;
  }
}

/** Snapshot the awaited exact-session spawn result, never mutable later events. */
export function initialSelectionEvidence(
  session: AcpSession,
): DelegatedInitialSelectionEvidence {
  const base: DelegatedInitialSelectionEvidence = {
    schemaVersion: 1,
    source: "unavailable",
    subject: "delegated-worker",
    coverage: "initial-selection-only",
    state: "unavailable",
    commandProvenance: "unverified",
    rejection: null,
    modelSha256: null,
    selectionSha256: null,
    reasoningEffort: null,
    effectiveExecution: "unavailable",
  };
  const finish = (changes: Partial<DelegatedInitialSelectionEvidence> = {}) =>
    Object.freeze({ ...base, ...changes });
  const outer = record(session);
  if (outer?.agentType !== "codex" || outer.initialModelSelection == null)
    return finish();
  const value = record(outer.initialModelSelection);
  if (
    value?.schemaVersion !== 1 ||
    value.source !== "acp-session-new" ||
    !["configured-command-1.13.1", "unverified"].includes(
      value.commandProvenance as string,
    ) ||
    !["reported", "unavailable", "rejected", "truncated"].includes(
      value.state as string,
    )
  )
    return finish({ state: "rejected", rejection: "malformed" });
  const commandProvenance =
    value.commandProvenance as DelegatedInitialSelectionEvidence["commandProvenance"];
  if (value.state === "rejected" || value.state === "truncated")
    return finish({
      state: "rejected",
      commandProvenance,
      rejection: value.state === "truncated" ? "truncated" : "malformed",
    });
  let legacy: { model: string; effort: Effort } | undefined;
  if (value.legacyModelId != null) {
    if (commandProvenance !== "configured-command-1.13.1") {
      // Unknown legacy formats are not parsed, even if they resemble this one.
      if (value.config == null) return finish({ commandProvenance });
      return finish({
        state: "rejected",
        commandProvenance,
        rejection: "malformed",
      });
    }
    const match =
      typeof value.legacyModelId === "string" &&
      value.legacyModelId.length <= 200
        ? /^([a-zA-Z0-9._:/-]+)\[([^[\]]+)\]$/u.exec(value.legacyModelId)
        : null;
    if (!match || !model(match[1]) || !effort(match[2]))
      return finish({
        state: "rejected",
        commandProvenance,
        rejection: "malformed",
      });
    legacy = { model: match[1], effort: match[2] };
  }
  const config = value.config == null ? undefined : record(value.config);
  if (
    value.config != null &&
    (!config ||
      !model(config.model) ||
      (config.reasoningEffort != null && !effort(config.reasoningEffort)))
  )
    return finish({
      state: "rejected",
      commandProvenance,
      rejection: "malformed",
    });
  if (value.state === "unavailable" && (config || legacy))
    return finish({
      state: "rejected",
      commandProvenance,
      rejection: "malformed",
    });
  if (!config && !legacy) return finish({ commandProvenance });
  if (
    config &&
    legacy &&
    (config.model !== legacy.model ||
      (config.reasoningEffort != null &&
        config.reasoningEffort !== legacy.effort))
  )
    return finish({ state: "conflicting", commandProvenance });
  const selectedModel = (config?.model ?? legacy?.model) as string;
  // A missing config effort stays missing, even if legacy supplies an effort.
  const selectedEffort = config
    ? (config.reasoningEffort as Effort | null)
    : legacy?.effort;
  return finish({
    source: config
      ? "acp-session-new-config-options"
      : "acp-session-new-legacy-model-state",
    state: "reported",
    commandProvenance,
    modelSha256: digest(selectedModel),
    selectionSha256: digest(
      `doolittle/acp-initial-selection/v1\0${JSON.stringify([selectedModel, selectedEffort ?? null])}`,
    ),
    reasoningEffort: selectedEffort ?? null,
  });
}
