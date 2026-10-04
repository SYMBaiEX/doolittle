import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

// Exact consumer contract of runtime/native/plugin-registry/eval-model-input-observations.
export const MODEL_INPUT_FLAG = "DOOLITTLE_EVAL_CAPTURE_MODEL_INPUTS";
export const MODEL_INPUT_FILE = "eval-model-input-observations.jsonl";
export const MODEL_INPUT_BYTE_LIMIT = 2 * 1024 * 1024;
export const MODEL_INPUT_ROW_LIMIT = 512;
export const MODEL_INPUT_ROW_BYTE_LIMIT = 4096;
const SLOTS = [
  "unknown",
  "TEXT_NANO",
  "TEXT_SMALL",
  "TEXT_MEDIUM",
  "TEXT_LARGE",
  "TEXT_MEGA",
  "RESPONSE_HANDLER",
  "ACTION_PLANNER",
  "TEXT_COMPLETION",
  "IMAGE_DESCRIPTION",
  "RESEARCH",
  "TEXT_EMBEDDING",
  "TEXT_EMBEDDING_BATCH",
] as const;
const PROVIDERS = [
  "unknown",
  "codex-cli",
  "codex",
  "anthropic",
  "openai",
  "elizaOSCloud",
  "ollama",
  "claude-code",
  "devin",
] as const;
type Slot = (typeof SLOTS)[number];
type Provider = (typeof PROVIDERS)[number];
type Common<Version extends 1 | 2 = 1 | 2> = {
  version: Version;
  phase: "unknown";
  priorSinkMs: number;
};
type InputFields = {
  kind: "input";
  ordinal: number;
  slot: Slot;
  requestedSlot: Slot;
  provider: Provider;
  systemChars: number | null;
  promptChars: number | null;
  messageTextChars: number | null;
  messageCount: number | null;
  imageCount: number | null;
  toolCount: number | null;
  toolSchemaChars: number | null;
  requestedStreaming: boolean | null;
  partial: boolean;
  projectionMs: number;
};
export type ModelInputObservationRow =
  | (Common<1> & InputFields)
  | (Common<2> &
      InputFields & {
        toolCallArgumentChars: number | null;
        toolResultTextChars: number | null;
      })
  | (Common & {
      kind: "settlement";
      ordinal: number | null;
      association: "same-params-object" | "unavailable";
      consumedStreaming: boolean | null;
    })
  | (Common & {
      kind: "provider-usage";
      ordinal: number | null;
      association: "same-params-object" | "unavailable";
      completed: boolean;
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
    });
export interface ModelInputObservations {
  coverage: "first-creating-runtime-only";
  status: "complete" | "partial" | "unavailable";
  sourceSha256: string | null;
  bytesRead: number;
  scannedRows: number;
  rejectedRows: number;
  truncated: boolean;
  byteLimit: number;
  rowLimit: number;
  rowByteLimit: number;
  rows: ModelInputObservationRow[];
}
export interface ModelInputDataRoot {
  readonly path: string;
  readonly dev: bigint;
  readonly ino: bigint;
}

export function unavailableModelInputObservations(): ModelInputObservations {
  return {
    coverage: "first-creating-runtime-only",
    status: "unavailable",
    sourceSha256: null,
    bytesRead: 0,
    scannedRows: 0,
    rejectedRows: 0,
    truncated: false,
    byteLimit: MODEL_INPUT_BYTE_LIMIT,
    rowLimit: MODEL_INPUT_ROW_LIMIT,
    rowByteLimit: MODEL_INPUT_ROW_BYTE_LIMIT,
    rows: [],
  };
}

/** Pin the freshly created data root before the first invocation; never adopt a replacement. */
export function pinModelInputDataRoot(
  path: string,
): ModelInputDataRoot | undefined {
  try {
    if (
      !process.getuid ||
      !constants.O_NOFOLLOW ||
      !isAbsolute(path) ||
      realpathSync(path) !== path
    )
      return undefined;
    const owner = BigInt(process.getuid());
    for (let current = path; ; current = dirname(current)) {
      const stat = lstatSync(current, { bigint: true });
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (stat.uid !== owner && stat.uid !== 0n) ||
        ((stat.mode & 0o022n) !== 0n && (stat.mode & 0o1000n) === 0n)
      )
        return undefined;
      if (dirname(current) === current) break;
    }
    const stat = lstatSync(path, { bigint: true });
    if (stat.uid !== owner || (stat.mode & 0o777n) !== 0o700n) return undefined;
    return { path, dev: stat.dev, ino: stat.ino };
  } catch {
    return undefined;
  }
}
function verifyRoot(root: ModelInputDataRoot): boolean {
  const current = pinModelInputDataRoot(root.path);
  return current?.dev === root.dev && current.ino === root.ino;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function count(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): value is number | null {
  return (
    value === null ||
    (finite(value) && Number.isSafeInteger(value) && value <= max)
  );
}
function nullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}
const COMMON = ["version", "phase", "priorSinkMs", "kind", "ordinal"];
type Associations = Map<
  number,
  { version: 1 | 2; settled: boolean; usage: boolean }
>;
/** Called only on JSON.parse output; unknown keys are rejected, never copied. */
function projectRow(
  value: unknown,
  inputs: Associations,
): ModelInputObservationRow | undefined {
  if (
    !record(value) ||
    (value.version !== 1 && value.version !== 2) ||
    value.phase !== "unknown" ||
    !finite(value.priorSinkMs)
  )
    return undefined;
  const common: Common = {
    version: value.version,
    phase: "unknown",
    priorSinkMs: value.priorSinkMs,
  };
  if (value.kind === "input") {
    if (
      !exact(value, [
        ...COMMON,
        "slot",
        "requestedSlot",
        "provider",
        "systemChars",
        "promptChars",
        "messageTextChars",
        ...(value.version === 2
          ? ["toolCallArgumentChars", "toolResultTextChars"]
          : []),
        "messageCount",
        "imageCount",
        "toolCount",
        "toolSchemaChars",
        "requestedStreaming",
        "partial",
        "projectionMs",
      ]) ||
      !count(value.ordinal, 512) ||
      value.ordinal === null ||
      value.ordinal < 1 ||
      inputs.has(value.ordinal) ||
      value.ordinal <= Math.max(0, ...inputs.keys()) ||
      typeof value.slot !== "string" ||
      !SLOTS.includes(value.slot as Slot) ||
      typeof value.requestedSlot !== "string" ||
      !SLOTS.includes(value.requestedSlot as Slot) ||
      typeof value.provider !== "string" ||
      !PROVIDERS.includes(value.provider as Provider) ||
      !count(value.systemChars) ||
      !count(value.promptChars) ||
      !count(value.messageTextChars) ||
      (value.version === 2 &&
        (!count(value.toolCallArgumentChars, 65_536) ||
          !count(value.toolResultTextChars))) ||
      !count(value.messageCount, 64) ||
      !count(value.imageCount, 4096) ||
      !count(value.toolCount, 64) ||
      !count(value.toolSchemaChars, 65536) ||
      !nullableBoolean(value.requestedStreaming) ||
      typeof value.partial !== "boolean" ||
      !finite(value.projectionMs)
    )
      return undefined;
    inputs.set(value.ordinal, {
      version: value.version,
      settled: false,
      usage: false,
    });
    const row = {
      ...common,
      kind: "input" as const,
      ordinal: value.ordinal,
      slot: value.slot as Slot,
      requestedSlot: value.requestedSlot as Slot,
      provider: value.provider as Provider,
      systemChars: value.systemChars,
      promptChars: value.promptChars,
      messageTextChars: value.messageTextChars,
      messageCount: value.messageCount,
      imageCount: value.imageCount,
      toolCount: value.toolCount,
      toolSchemaChars: value.toolSchemaChars,
      requestedStreaming: value.requestedStreaming,
      partial: value.partial,
      projectionMs: value.projectionMs,
    };
    return value.version === 2
      ? {
          ...row,
          version: 2,
          toolCallArgumentChars: value.toolCallArgumentChars as number | null,
          toolResultTextChars: value.toolResultTextChars as number | null,
        }
      : { ...row, version: 1 };
  }
  if (value.kind !== "settlement" && value.kind !== "provider-usage")
    return undefined;
  if (
    !count(value.ordinal, 512) ||
    (value.ordinal !== null && value.ordinal < 1) ||
    (value.association !== "same-params-object" &&
      value.association !== "unavailable") ||
    (value.association === "unavailable") !== (value.ordinal === null)
  )
    return undefined;
  const input = value.ordinal === null ? undefined : inputs.get(value.ordinal);
  if (
    value.ordinal !== null &&
    (!input ||
      input.version !== value.version ||
      input.settled ||
      (value.kind === "provider-usage" && input.usage))
  )
    return undefined;
  if (value.kind === "settlement") {
    if (
      !exact(value, [...COMMON, "association", "consumedStreaming"]) ||
      !nullableBoolean(value.consumedStreaming)
    )
      return undefined;
    if (input) input.settled = true;
    return {
      ...common,
      kind: "settlement",
      ordinal: value.ordinal,
      association: value.association,
      consumedStreaming: value.consumedStreaming,
    };
  }
  if (
    !exact(value, [
      ...COMMON,
      "association",
      "completed",
      "inputTokens",
      "outputTokens",
      "totalTokens",
    ]) ||
    typeof value.completed !== "boolean" ||
    ![value.inputTokens, value.outputTokens, value.totalTokens].every(
      (token) => token === null || finite(token),
    )
  )
    return undefined;
  if (input) input.usage = true;
  return {
    ...common,
    kind: "provider-usage",
    ordinal: value.ordinal,
    association: value.association,
    completed: value.completed,
    inputTokens: value.inputTokens as number | null,
    outputTokens: value.outputTokens as number | null,
    totalTokens: value.totalTokens as number | null,
  };
}

/** Quiescent owned state only. Data caps do not bound synchronous filesystem latency or provide openat race immunity. */
export function readModelInputObservations(
  root: ModelInputDataRoot | undefined,
): ModelInputObservations {
  const output = unavailableModelInputObservations();
  let fd: number | undefined;
  try {
    if (!root || !verifyRoot(root)) return output;
    const path = join(root.path, MODEL_INPUT_FILE);
    // Open without following the leaf and without blocking on a FIFO. The FD,
    // not a pre-open pathname check, is the authoritative expected identity.
    fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    const stat = fstatSync(fd, { bigint: true });
    if (
      !stat.isFile() ||
      stat.uid !== BigInt(process.getuid?.() ?? -1) ||
      stat.nlink !== 1n ||
      (stat.mode & 0o777n) !== 0o600n ||
      !verifyRoot(root)
    )
      return output;
    const leaf = lstatSync(path, { bigint: true });
    if (
      !leaf.isFile() ||
      leaf.isSymbolicLink() ||
      leaf.dev !== stat.dev ||
      leaf.ino !== stat.ino ||
      leaf.uid !== stat.uid ||
      (leaf.mode & 0o777n) !== 0o600n ||
      leaf.nlink !== 1n ||
      leaf.size !== stat.size ||
      leaf.mtimeNs !== stat.mtimeNs ||
      realpathSync(path) !== path ||
      !verifyRoot(root)
    )
      return output;
    output.truncated = stat.size > BigInt(MODEL_INPUT_BYTE_LIMIT);
    const bytes = Buffer.alloc(
      Number(
        stat.size > BigInt(MODEL_INPUT_BYTE_LIMIT)
          ? BigInt(MODEL_INPUT_BYTE_LIMIT)
          : stat.size,
      ),
    );
    while (output.bytesRead < bytes.length) {
      const read = readSync(
        fd,
        bytes,
        output.bytesRead,
        bytes.length - output.bytesRead,
        null,
      );
      if (!read) break;
      output.bytesRead += read;
    }
    const after = lstatSync(path, { bigint: true });
    const descriptorAfter = fstatSync(fd, { bigint: true });
    if (
      !verifyRoot(root) ||
      after.isSymbolicLink() ||
      !after.isFile() ||
      after.dev !== stat.dev ||
      after.ino !== stat.ino ||
      after.nlink !== 1n ||
      after.uid !== stat.uid ||
      (after.mode & 0o777n) !== 0o600n ||
      after.size !== stat.size ||
      after.mtimeNs !== stat.mtimeNs ||
      descriptorAfter.size !== stat.size ||
      descriptorAfter.mtimeNs !== stat.mtimeNs ||
      realpathSync(path) !== path
    )
      return unavailableModelInputObservations();
    if (output.bytesRead === 0) return output;
    if (!output.truncated && output.bytesRead === Number(stat.size))
      output.sourceSha256 = createHash("sha256").update(bytes).digest("hex");
    else output.truncated = true;
    let stored = bytes.subarray(0, output.bytesRead).toString("utf8");
    if (!stored.length) return output;
    if (!stored.endsWith("\n")) output.truncated = true;
    if (output.truncated)
      stored = stored.slice(0, stored.lastIndexOf("\n") + 1);
    const inputs: Associations = new Map();
    let offset = 0;
    while (offset < stored.length) {
      if (output.scannedRows >= MODEL_INPUT_ROW_LIMIT) {
        output.truncated = true;
        break;
      }
      const newline = stored.indexOf("\n", offset);
      const line = stored.slice(offset, newline < 0 ? stored.length : newline);
      offset = newline < 0 ? stored.length : newline + 1;
      output.scannedRows++;
      if (Buffer.byteLength(line) + 1 > MODEL_INPUT_ROW_BYTE_LIMIT) {
        output.rejectedRows++;
        continue;
      }
      let projected: ModelInputObservationRow | undefined;
      try {
        projected = projectRow(JSON.parse(line), inputs);
      } catch {
        /* no raw content or errors leave this reader */
      }
      if (projected) output.rows.push(projected);
      else output.rejectedRows++;
    }
    output.status =
      output.truncated || output.rejectedRows ? "partial" : "complete";
  } catch {
    /* missing/unsafe optional evidence remains unavailable */
  } finally {
    if (fd !== undefined)
      try {
        closeSync(fd);
      } catch {
        output.status = "partial";
      }
  }
  return output;
}
