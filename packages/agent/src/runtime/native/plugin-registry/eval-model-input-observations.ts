import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, parse } from "node:path";
import type { IAgentRuntime, Plugin } from "@elizaos/core";
import type { CodexModelCallMetric } from "./eval-model-metrics";

export const MODEL_INPUT_OBSERVATION_FLAG =
  "DOOLITTLE_EVAL_CAPTURE_MODEL_INPUTS";
export const MODEL_INPUT_OBSERVATION_FILE =
  "eval-model-input-observations.jsonl";
const MAX_ROWS = 512;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 64;
const MISSING = Symbol("missing own data");
const UNAVAILABLE = Symbol("unavailable own data");
const SLOTS = [
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
  "codex-cli",
  "codex",
  "anthropic",
  "openai",
  "elizaOSCloud",
  "ollama",
  "claude-code",
  "devin",
] as const;

// Fixed-key descriptor reads never evaluate accessors or inherited values.
function data(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return MISSING;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor
    ? "value" in descriptor
      ? descriptor.value
      : UNAVAILABLE
    : MISSING;
}
function items(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value)) return null;
  const length = data(value, "length");
  if (typeof length !== "number" || length > MAX_ITEMS) return null;
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const item = data(value, String(index));
    if (item === MISSING) return null;
    result.push(item);
  }
  return result;
}
function closed(value: unknown, choices: readonly string[]): string {
  return typeof value === "string" && choices.includes(value)
    ? value
    : "unknown";
}
function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** JSON character count for a small own-data JSON subset, without serialization. */
function schemaChars(
  value: unknown,
  budget = { nodes: 0, scanned: 0 },
): number | null {
  const active = new Set<object>();
  const stringChars = (text: string) => {
    budget.scanned += text.length;
    if (budget.scanned > 65_536) throw MISSING;
    let count = 2;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code))
        count += 2;
      else if (code < 32) count += 6;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          count += 2;
          index++;
        } else count += 6;
      } else if (code >= 0xdc00 && code <= 0xdfff) count += 6;
      else count++;
    }
    return count;
  };
  const visit = (entry: unknown, depth: number): number => {
    if (++budget.nodes > 512 || depth > 8) throw MISSING;
    if (entry === null) return 4;
    if (typeof entry === "string") return stringChars(entry);
    if (typeof entry === "boolean") return entry ? 4 : 5;
    if (typeof entry === "number" && Number.isFinite(entry))
      return String(entry).length;
    if (!entry || typeof entry !== "object" || active.has(entry)) throw MISSING;
    active.add(entry);
    try {
      if (Array.isArray(entry)) {
        const array = items(entry);
        if (!array) throw MISSING;
        return (
          2 +
          Math.max(0, array.length - 1) +
          array.reduce<number>((sum, child) => sum + visit(child, depth + 1), 0)
        );
      }
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== null && prototype !== Object.prototype) throw MISSING;
      const keys = Reflect.ownKeys(entry);
      if (
        keys.length > MAX_ITEMS ||
        keys.some((key) => typeof key !== "string")
      )
        throw MISSING;
      let count = 2;
      let entries = 0;
      for (const key of keys) {
        if (typeof key !== "string") throw MISSING;
        const descriptor = Object.getOwnPropertyDescriptor(entry, key);
        if (!descriptor || !("value" in descriptor)) throw MISSING;
        if (key === "toJSON") throw MISSING;
        if (!descriptor.enumerable) continue;
        count += stringChars(key) + 1 + visit(descriptor.value, depth + 1);
        entries++;
      }
      return count + Math.max(0, entries - 1);
    } finally {
      active.delete(entry);
    }
  };
  try {
    return visit(value, 0);
  } catch {
    return null;
  }
}

export function projectModelInput(params: unknown) {
  const result = {
    systemChars: null as number | null,
    promptChars: null as number | null,
    messageTextChars: null as number | null,
    toolCallArgumentChars: null as number | null,
    toolResultTextChars: null as number | null,
    messageCount: null as number | null,
    imageCount: null as number | null,
    toolCount: null as number | null,
    toolSchemaChars: null as number | null,
    requestedStreaming: null as boolean | null,
    partial: false,
  };
  try {
    if (!params || typeof params !== "object") result.partial = true;
    for (const [key, target] of [
      ["system", "systemChars"],
      ["prompt", "promptChars"],
    ] as const) {
      const value = data(params, key);
      if (typeof value === "string") result[target] = value.length;
      else if (value !== MISSING) result.partial = true;
    }
    const stream = data(params, "stream");
    result.requestedStreaming = typeof stream === "boolean" ? stream : null;
    if (stream !== MISSING && typeof stream !== "boolean")
      result.partial = true;
    const messages = data(params, "messages");
    if (messages !== MISSING) {
      const array = items(messages);
      if (!array) result.partial = true;
      else {
        result.messageCount = array.length;
        let chars = 0;
        let argumentChars = 0;
        let resultChars = 0;
        // One shared traversal budget across native arguments, not per part.
        const argumentBudget = { nodes: 0, scanned: 0 };
        let images = 0;
        let complete = true;
        for (const message of array) {
          const content = data(message, "content");
          if (typeof content === "string") {
            chars += content.length;
            continue;
          }
          const parts = items(content);
          if (!parts) {
            complete = false;
            continue;
          }
          for (const part of parts) {
            const type = data(part, "type");
            if (type === "text") {
              const text = data(part, "text");
              if (typeof text === "string") chars += text.length;
              else complete = false;
            } else if (type === "image") images++;
            else if (type === "tool-call") {
              const size = schemaChars(data(part, "input"), argumentBudget);
              if (size === null) complete = false;
              else argumentChars += size;
              if (argumentChars > 65_536) complete = false;
            } else if (type === "tool-result") {
              const output = data(part, "output");
              const outputType = data(output, "type");
              const value = data(output, "value");
              if (
                (outputType === "text" || outputType === "error-text") &&
                typeof value === "string"
              )
                resultChars += value.length;
              else complete = false;
            } else complete = false;
          }
        }
        if (complete) {
          result.messageTextChars = chars;
          result.toolCallArgumentChars = argumentChars;
          result.toolResultTextChars = resultChars;
          result.imageCount = images;
        } else result.partial = true;
      }
    }
    const tools = data(params, "tools");
    if (tools !== MISSING) {
      const array = items(tools);
      if (!array) result.partial = true;
      else {
        result.toolCount = array.length;
        let count = 0;
        let complete = true;
        for (const tool of array) {
          // Both public flat tools and OpenAI-style function tools are supported.
          const nested = data(tool, "function");
          const schema = data(nested === MISSING ? tool : nested, "parameters");
          const size = schemaChars(schema);
          if (size === null) complete = false;
          else count += size;
          if (count > 65_536) {
            complete = false;
            break;
          }
        }
        if (complete) result.toolSchemaChars = count;
        else result.partial = true;
      }
    }
  } catch {
    result.partial = true;
  }
  return result;
}

type DirectoryIdentity = { path: string; dev: number; ino: number };
function directoryIdentity(path: string): DirectoryIdentity {
  if (!isAbsolute(path) || realpathSync(path) !== path) throw MISSING;
  for (let current = path; ; current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw MISSING;
    if (current === parse(current).root) break;
  }
  const stat = lstatSync(path);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0
  )
    throw MISSING;
  return { path, dev: stat.dev, ino: stat.ino };
}
function sameDirectory(identity: DirectoryIdentity) {
  const current = directoryIdentity(identity.path);
  if (current.dev !== identity.dev || current.ino !== identity.ino)
    throw MISSING;
}

/** Never creates/chmods the data root, follows aliases, or repairs foreign files. */
export function createModelInputObservationSink(dataDir: string) {
  let identity: DirectoryIdentity | undefined;
  try {
    identity = directoryIdentity(dataDir);
  } catch {
    /* retain unavailable */
  }
  let fileIdentity: { dev: number; ino: number } | undefined;
  let rows = 0;
  return (row: object): void => {
    if (!identity || rows >= MAX_ROWS) return;
    rows++;
    let fd: number | undefined;
    try {
      sameDirectory(identity);
      const path = join(identity.path, MODEL_INPUT_OBSERVATION_FILE);
      if (!fileIdentity) {
        fd = openSync(
          path,
          constants.O_WRONLY |
            constants.O_APPEND |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW |
            constants.O_NONBLOCK,
          0o600,
        );
      } else {
        fd = openSync(
          path,
          constants.O_WRONLY |
            constants.O_APPEND |
            constants.O_NOFOLLOW |
            constants.O_NONBLOCK,
        );
      }
      const stat = fstatSync(fd);
      const named = lstatSync(path);
      sameDirectory(identity);
      if (
        !stat.isFile() ||
        stat.uid !== process.getuid?.() ||
        (stat.mode & 0o777) !== 0o600 ||
        stat.nlink !== 1 ||
        stat.dev !== named.dev ||
        stat.ino !== named.ino ||
        named.isSymbolicLink()
      )
        throw MISSING;
      if (
        fileIdentity &&
        (fileIdentity.dev !== stat.dev || fileIdentity.ino !== stat.ino)
      )
        throw MISSING;
      fileIdentity ??= { dev: stat.dev, ino: stat.ino };
      // row is already a closed projection, never unknown model input.
      const bytes = Buffer.from(`${JSON.stringify(row)}\n`);
      if (bytes.length > 4096 || stat.size + bytes.length > MAX_FILE_BYTES)
        return;
      writeSync(fd, bytes);
    } catch {
      // Optional measurement cannot alter provider, stream, or cancellation.
    } finally {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          /* fail open */
        }
      }
    }
  };
}

type Observation = {
  ordinal: number;
  ambiguous: boolean;
  slot: string;
  requestedSlot: string;
  provider: string;
  settled: boolean;
  usageSeen: boolean;
};
type Observer = ReturnType<typeof createObserver>;
const observers = new WeakMap<IAgentRuntime, Observer>();
function createObserver(sink: (row: object) => void) {
  const inputs = new WeakMap<object, Observation>();
  let ordinal = 0;
  let rows = 0;
  let priorSinkMs = 0;
  const emit = (row: object) => {
    if (rows++ >= MAX_ROWS) return;
    const started = performance.now();
    try {
      sink({ version: 2, phase: "unknown", priorSinkMs, ...row });
    } catch {
      /* fail open */
    }
    priorSinkMs += Math.max(0, performance.now() - started);
  };
  return {
    pre(
      params: unknown,
      slot: unknown,
      requestedSlot: unknown,
      provider: unknown,
    ) {
      if (ordinal >= MAX_ROWS) return;
      const started = performance.now();
      const observation: Observation = {
        ordinal: ++ordinal,
        ambiguous: false,
        slot: closed(slot, SLOTS),
        requestedSlot: closed(requestedSlot, SLOTS),
        provider: closed(provider, PROVIDERS),
        settled: false,
        usageSeen: false,
      };
      if (params && typeof params === "object") {
        const previous = inputs.get(params);
        if (previous) {
          previous.ambiguous = true;
          observation.ambiguous = true;
        }
        inputs.set(params, observation);
      } else observation.ambiguous = true;
      const projection = projectModelInput(params);
      emit({
        kind: "input",
        ordinal: observation.ordinal,
        slot: observation.slot,
        requestedSlot: observation.requestedSlot,
        provider: observation.provider,
        ...projection,
        projectionMs: Math.max(0, performance.now() - started),
      });
    },
    post(params: unknown, streaming: unknown) {
      const input =
        params && typeof params === "object" ? inputs.get(params) : undefined;
      const associated = input && !input.ambiguous && !input.settled;
      emit({
        kind: "settlement",
        ordinal: associated ? input.ordinal : null,
        association: associated ? "same-params-object" : "unavailable",
        consumedStreaming: typeof streaming === "boolean" ? streaming : null,
      });
      if (input) input.settled = true;
    },
    usage(params: unknown, metric: CodexModelCallMetric) {
      const input =
        params && typeof params === "object" ? inputs.get(params) : undefined;
      const associated =
        input && !input.ambiguous && !input.settled && !input.usageSeen;
      if (input) input.usageSeen = true;
      emit({
        kind: "provider-usage",
        ordinal: associated ? input.ordinal : null,
        association: associated ? "same-params-object" : "unavailable",
        completed: metric.completed === true,
        inputTokens: finite(metric.inputTokens),
        outputTokens: finite(metric.outputTokens),
        totalTokens: finite(metric.totalTokens),
      });
    },
  };
}

/** Existing Codex observer seam; identity only, never an order/time join. */
export function observeEvalModelInputUsage(
  runtime: IAgentRuntime,
  params: unknown,
  metric: CodexModelCallMetric,
): void {
  try {
    observers.get(runtime)?.usage(params, metric);
  } catch {
    /* fail open */
  }
}

export function createEvalModelInputObservationsPlugin(
  options: { enabled?: boolean; sink?: (row: object) => void } = {},
): Plugin {
  return {
    name: "doolittle-eval-model-input-observations",
    description: "Optional content-free resolved model-input observations.",
    init: (_config, runtime) => {
      if (
        !(
          options.enabled ??
          process.env[MODEL_INPUT_OBSERVATION_FLAG] === "true"
        )
      )
        return;
      try {
        const sink =
          options.sink ??
          createModelInputObservationSink(process.env.DOOLITTLE_DATA_DIR ?? "");
        const observer = createObserver(sink);
        observers.set(runtime, observer);
        for (const phase of ["pre_model", "post_model"] as const) {
          const id = `doolittle-eval-model-input-${phase}`;
          runtime.unregisterPipelineHook(id);
          runtime.registerPipelineHook({
            id,
            phase,
            schedule: "serial",
            position: 100,
            mutatesPrimary: false,
            handler: (_runtime, context) => {
              try {
                if (context.phase === "pre_model")
                  observer.pre(
                    context.params,
                    context.resolvedModelKey,
                    context.requestedModelType,
                    context.provider,
                  );
                else if (context.phase === "post_model")
                  observer.post(context.params, context.streaming);
              } catch {
                /* fail open */
              }
            },
          });
        }
      } catch {
        observers.delete(runtime);
      }
    },
  };
}
