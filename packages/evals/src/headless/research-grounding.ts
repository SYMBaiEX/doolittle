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

export const SDK_WEB_RESEARCH_QUERY =
  "OpenAI Codex TypeScript SDK WebSearchMode ThreadOptions webSearchMode";
export const SDK_WEB_RESEARCH_SOURCE =
  "https://raw.githubusercontent.com/openai/codex/main/sdk/typescript/src/threadOptions.ts";
export const RESEARCH_JOURNAL_BYTE_LIMIT = 2 * 1024 * 1024;
export const RESEARCH_JOURNAL_EVENT_LIMIT = 2048;
const MAX_VALUE_CHARS = 4000;
const ID = /^[a-zA-Z0-9:_-]{1,128}$/u;
type DirectoryIdentity = { path: string; dev: bigint; ino: bigint };
export type ResearchDataRoot = {
  task: DirectoryIdentity;
  data: DirectoryIdentity;
};
export type ResearchGroundingReason =
  | "verified"
  | "execution-unconfirmed"
  | "unsafe-input"
  | "missing-input"
  | "truncated-input"
  | "invalid-input"
  | "identity-unavailable"
  | "action-policy"
  | "retrieval-unavailable"
  | "answer-disagreement";
export type ResearchCitationClassification =
  | "unavailable"
  | "exact"
  | "non-string"
  | "whitespace"
  | "github-view"
  | "other-url"
  | "non-url";
/** Closed projection only. No source text, query, URL, IDs or errors escape. */
export interface ResearchGrounding {
  provenance: "original-cli-action-journal";
  status: "verified" | "failed" | "unavailable";
  reason: ResearchGroundingReason;
  searchReturnedData: boolean;
  /** At the SDK's recorded value boundary; does not prove actual truncation. */
  searchOutputAtCap: boolean;
  primarySourceRetrieved: boolean;
  answerMatchesSource: boolean;
  citationMatches: boolean;
  /** Diagnostic only, after qualified original execution and retrieval. */
  citationClassification: ResearchCitationClassification;
  executionIntegrity: boolean;
}
export function unavailableResearchGrounding(
  reason: ResearchGroundingReason = "missing-input",
): ResearchGrounding {
  return {
    provenance: "original-cli-action-journal",
    status: "unavailable",
    reason,
    searchReturnedData: false,
    searchOutputAtCap: false,
    primarySourceRetrieved: false,
    answerMatchesSource: false,
    citationMatches: false,
    citationClassification: "unavailable",
    executionIntegrity: false,
  };
}
function directory(path: string, privateMode = false): DirectoryIdentity {
  if (!process.getuid || !isAbsolute(path) || realpathSync(path) !== path)
    throw new Error();
  const stat = lstatSync(path, { bigint: true });
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== BigInt(process.getuid()) ||
    (stat.mode & 0o022n) !== 0n ||
    (privateMode && (stat.mode & 0o777n) !== 0o700n)
  )
    throw new Error();
  return { path, dev: stat.dev, ino: stat.ino };
}
function verifyDirectory(identity: DirectoryIdentity, privateMode = false) {
  const current = directory(identity.path, privateMode);
  if (current.dev !== identity.dev || current.ino !== identity.ino)
    throw new Error();
}
/** Pin newly created task/data roots before dispatch; never adopt replacements. */
export function pinResearchDataRoot(
  dataDir: string,
): ResearchDataRoot | undefined {
  try {
    if (!process.getuid || !constants.O_NOFOLLOW) return undefined;
    const task = directory(dirname(dataDir), true);
    const data = directory(dataDir, true);
    if (data.path !== join(task.path, "data")) return undefined;
    for (let current = dirname(task.path); ; current = dirname(current)) {
      const stat = lstatSync(current, { bigint: true });
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (stat.uid !== BigInt(process.getuid()) && stat.uid !== 0n) ||
        ((stat.mode & 0o022n) !== 0n && (stat.mode & 0o1000n) === 0n)
      )
        return undefined;
      if (current === dirname(current)) break;
    }
    return { task, data };
  } catch {
    return undefined;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function classifyCitation(value: unknown): ResearchCitationClassification {
  if (typeof value !== "string") return "non-string";
  if (value === SDK_WEB_RESEARCH_SOURCE) return "exact";
  if (value.trim() === SDK_WEB_RESEARCH_SOURCE) return "whitespace";
  if (
    value ===
    "https://github.com/openai/codex/blob/main/sdk/typescript/src/threadOptions.ts"
  )
    return "github-view";
  try {
    new URL(value);
    return "other-url";
  } catch {
    return "non-url";
  }
}
function timestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length > 64) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}
function boundedValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length < MAX_VALUE_CHARS &&
    !value.includes("[max-depth]") &&
    !value.includes("[redacted]") &&
    !value.includes("[truncated")
  );
}
function returnedSearchData(data: Record<string, unknown>): boolean {
  // Opaque SDK-recorded data only, not complete results or search quality.
  return (
    data.query === SDK_WEB_RESEARCH_QUERY &&
    (data.provider === "parallel" || data.provider === "exa") &&
    typeof data.value === "string" &&
    data.value.trim().length > 0 &&
    data.value.length <= MAX_VALUE_CHARS &&
    !data.value.includes("[max-depth]") &&
    !data.value.includes("[redacted]") &&
    !data.value.includes("[truncated")
  );
}
/** Preserve offsets while excluding lexical non-code from this small subset.
 * Regex literals and interpolated templates are unsupported, not guessed.
 */
function sourceCode(value: string): string | undefined {
  const code = value.split("");
  const mask = (start: number, end: number) => {
    for (let index = start; index < end; index++)
      if (code[index] !== "\n" && code[index] !== "\r") code[index] = " ";
  };
  for (let index = 0; index < value.length; index++) {
    const start = index;
    if (value[index] === "/") {
      if (value[index + 1] === "/") {
        while (index < value.length && value[index] !== "\n") index++;
        mask(start, index);
      } else if (value[index + 1] === "*") {
        const end = value.indexOf("*/", index + 2);
        if (end < 0) return undefined;
        index = end + 1;
        mask(start, index + 1);
      } else return undefined;
    } else if (['"', "'", "`"].includes(value[index])) {
      const quote = value[index++];
      let closed = false;
      for (; index < value.length; index++) {
        if (quote === "`" && value[index] === "$" && value[index + 1] === "{")
          return undefined;
        if (value[index] === "\\") index++;
        else if (value[index] === quote) {
          closed = true;
          break;
        } else if (quote !== "`" && /[\r\n]/u.test(value[index]))
          return undefined;
      }
      if (!closed) return undefined;
      mask(start, index + 1);
    }
  }
  return code.join("");
}
function sourceDeclaration(
  value: string,
): { declaration: string; values: string[] } | undefined {
  // This task's supported proof subset is a literal exported string union,
  // not a TypeScript interpreter or a guess from model-generated summaries.
  const code = sourceCode(value);
  if (code === undefined) return undefined;
  const braceDepth: number[] = [];
  let depth = 0;
  for (let index = 0; index < code.length; index++) {
    braceDepth.push(depth);
    if (code[index] === "{") depth++;
    else if (code[index] === "}") {
      depth--;
      if (depth < 0) return undefined;
    }
  }
  if (depth !== 0) return undefined;
  const matches = [
    ...code.matchAll(/\bexport\s+type\s+WebSearchMode\s*=([^;]+);/gu),
  ];
  if (matches.length !== 1 || braceDepth[matches[0].index] !== 0)
    return undefined;
  const declaration = value.slice(
    matches[0].index,
    matches[0].index + matches[0][0].length,
  );
  const union = declaration.slice(declaration.indexOf("=") + 1, -1);
  const literals = union.trim().split(/\s*\|\s*/u);
  if (
    !literals.length ||
    literals.length > 16 ||
    literals.some((item) => !/^"[a-z-]{1,32}"$/u.test(item))
  )
    return undefined;
  const values = literals.map((item) => item.slice(1, -1));
  const options = [
    ...code.matchAll(/\bexport\s+type\s+ThreadOptions\s*=\s*\{([^{}]*)\};/gu),
  ];
  if (
    new Set(values).size !== values.length ||
    options.length !== 1 ||
    braceDepth[options[0].index] !== 0 ||
    [...options[0][1].matchAll(/\bwebSearchMode\?\s*:\s*WebSearchMode\s*;/gu)]
      .length !== 1
  )
    return undefined;
  return { declaration, values };
}
function cliBoundary(stdout: string, response: string) {
  if (Buffer.byteLength(stdout) > 10 * 1024 * 1024) return undefined;
  const events: Record<string, unknown>[] = [];
  const lines = stdout.split(/\r?\n/u);
  if (lines.length > 10_000) return undefined;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (record(value)) events.push(value);
    } catch {
      // Non-JSON startup logs are not identity/evidence; never echo them.
    }
  }
  const starts = events.filter((event) => event.type === "start");
  const results = events.filter((event) => event.type === "result");
  const completions = events.filter((event) => event.type === "completed");
  if (
    starts.length !== 1 ||
    results.length !== 1 ||
    completions.length !== 1 ||
    events.some((event) => event.type === "error")
  )
    return undefined;
  const [start] = starts;
  const [result] = results;
  const [completion] = completions;
  const startAt = timestamp(start.timestamp);
  const resultAt = timestamp(result.timestamp);
  const endAt = timestamp(completion.timestamp);
  if (
    !identifier(start.sessionId) ||
    startAt === undefined ||
    resultAt === undefined ||
    endAt === undefined ||
    startAt > resultAt ||
    resultAt > endAt ||
    events.indexOf(start) >= events.indexOf(result) ||
    events.indexOf(result) >= events.indexOf(completion) ||
    result.text !== response ||
    result.shouldExit !== false ||
    completion.status !== "completed"
  )
    return undefined;
  return { sessionId: start.sessionId, startAt, resultAt };
}
function projectJournal(
  stored: string,
  stdout: string,
  response: string,
): ResearchGrounding {
  const output = unavailableResearchGrounding("invalid-input");
  const boundary = cliBoundary(stdout, response);
  if (!boundary) return { ...output, reason: "identity-unavailable" };
  const rows = stored.split(/\r?\n/u).filter((line) => line.trim());
  if (!rows.length) return output;
  if (rows.length > RESEARCH_JOURNAL_EVENT_LIMIT)
    return { ...output, reason: "truncated-input" };
  const events: Record<string, unknown>[] = [];
  try {
    for (const line of rows) {
      if (Buffer.byteLength(line) > 262144)
        return { ...output, reason: "truncated-input" };
      const event: unknown = JSON.parse(line);
      if (!record(event)) return output;
      if (
        (event.event === "action.started" ||
          event.event === "action.completed") &&
        event.category !== "action"
      )
        return output;
      events.push(event);
    }
  } catch {
    return output;
  }
  const requests = events.filter(
    (event) =>
      event.category === "model" &&
      event.event === "model.request" &&
      record(event.metadata) &&
      event.metadata.path === "provider-message-service",
  );
  if (!requests.length) return { ...output, reason: "identity-unavailable" };
  const anchor = requests[0];
  if (
    anchor.source !== "cli" ||
    anchor.provider !== "codex" ||
    anchor.sessionId !== boundary.sessionId ||
    !identifier(anchor.runId) ||
    !identifier(anchor.roomId)
  )
    return { ...output, reason: "identity-unavailable" };
  const relevant = events.filter(
    (event) =>
      event.category === "action" ||
      (event.category === "model" &&
        record(event.metadata) &&
        event.metadata.path === "provider-message-service"),
  );
  let previousAt = boundary.startAt;
  for (const event of relevant) {
    const time = timestamp(event.createdAt);
    if (
      event.source !== "cli" ||
      event.sessionId !== anchor.sessionId ||
      event.runId !== anchor.runId ||
      event.roomId !== anchor.roomId ||
      time === undefined ||
      (event.category === "model" && event.provider !== "codex") ||
      time < previousAt ||
      time > boundary.resultAt
    )
      return { ...output, reason: "identity-unavailable" };
    previousAt = time;
    if (event.event === "model.error")
      return { ...output, reason: "execution-unconfirmed" };
  }
  const actions = relevant.filter((event) => event.category === "action");
  const web: Record<string, unknown>[] = [];
  for (const event of actions) {
    if (
      !record(event.metadata) ||
      !["WEB_SEARCH", "WEB_FETCH", "REPLY"].includes(
        String(event.metadata.action),
      ) ||
      !["action.started", "action.completed"].includes(String(event.event))
    )
      return { ...output, reason: "action-policy" };
    if (event.metadata.action !== "REPLY") web.push(event);
  }
  if (
    web.length !== 4 ||
    web[0].event !== "action.started" ||
    (web[0].metadata as Record<string, unknown>).action !== "WEB_SEARCH" ||
    web[1].event !== "action.completed" ||
    (web[1].metadata as Record<string, unknown>).action !== "WEB_SEARCH" ||
    web[2].event !== "action.started" ||
    (web[2].metadata as Record<string, unknown>).action !== "WEB_FETCH" ||
    web[3].event !== "action.completed" ||
    (web[3].metadata as Record<string, unknown>).action !== "WEB_FETCH" ||
    relevant.indexOf(anchor) >= relevant.indexOf(web[0])
  )
    return { ...output, reason: "action-policy" };
  const dataFor = (event: Record<string, unknown>, name: string) => {
    const metadata = event.metadata as Record<string, unknown>;
    const result = metadata.actionResult;
    return metadata.success === true &&
      metadata.status === "completed" &&
      record(result) &&
      result.success === true &&
      record(result.data) &&
      result.data.actionName === name
      ? result.data
      : undefined;
  };
  const search = dataFor(web[1], "WEB_SEARCH");
  const fetch = dataFor(web[3], "WEB_FETCH");
  const replies = actions.filter(
    (event) => record(event.metadata) && event.metadata.action === "REPLY",
  );
  if (replies.length) {
    const result = record(replies[1]?.metadata)
      ? replies[1].metadata.actionResult
      : undefined;
    if (
      replies.length !== 2 ||
      replies[0].event !== "action.started" ||
      replies[1].event !== "action.completed" ||
      relevant.indexOf(replies[0]) <= relevant.indexOf(web[3]) ||
      !record(replies[1].metadata) ||
      replies[1].metadata.status !== "completed" ||
      replies[1].metadata.success !== true ||
      !record(result) ||
      result.success !== true
    )
      return { ...output, reason: "action-policy" };
  }
  const models = relevant.filter((event) => event.category === "model");
  let pendingRequest = false;
  for (const event of models) {
    if (event.event === "model.request" && !pendingRequest)
      pendingRequest = true;
    else if (event.event === "model.response" && pendingRequest)
      pendingRequest = false;
    else return { ...output, reason: "execution-unconfirmed" };
  }
  const finalResponse = models.at(-1);
  const finalResponses = models.filter(
    (event) =>
      event.event === "model.response" &&
      record(event.metadata) &&
      event.metadata.response === response &&
      relevant.indexOf(event) > relevant.indexOf(web[3]),
  );
  if (
    pendingRequest ||
    finalResponse !== finalResponses[0] ||
    finalResponses.length !== 1 ||
    !record(finalResponses[0].metadata) ||
    finalResponses[0].metadata.runFailureMessage
  )
    return { ...output, reason: "execution-unconfirmed" };
  if (
    replies.length &&
    relevant.indexOf(replies[1]) >= relevant.indexOf(finalResponses[0])
  )
    return { ...output, reason: "action-policy" };
  output.executionIntegrity = true;
  output.searchReturnedData = Boolean(search && returnedSearchData(search));
  output.searchOutputAtCap =
    output.searchReturnedData &&
    typeof search?.value === "string" &&
    search.value.length === MAX_VALUE_CHARS;
  const source =
    fetch?.url === SDK_WEB_RESEARCH_SOURCE && boundedValue(fetch.value)
      ? sourceDeclaration(fetch.value)
      : undefined;
  output.primarySourceRetrieved = Boolean(source);
  if (!output.searchReturnedData || !source)
    return { ...output, status: "failed", reason: "retrieval-unavailable" };
  try {
    const answer: unknown = JSON.parse(response);
    if (record(answer)) {
      output.citationClassification = classifyCitation(answer.source);
      const keys = Object.keys(answer);
      output.citationMatches = answer.source === SDK_WEB_RESEARCH_SOURCE;
      output.answerMatchesSource =
        keys.length === 4 &&
        keys.every((key) =>
          ["values", "member", "declaration", "source"].includes(key),
        ) &&
        answer.member === "webSearchMode" &&
        answer.declaration === source.declaration &&
        Array.isArray(answer.values) &&
        JSON.stringify(answer.values) === JSON.stringify(source.values);
    }
  } catch {
    /* Unstructured answers do not prove the literal contract. */
  }
  return {
    ...output,
    status:
      output.answerMatchesSource && output.citationMatches
        ? "verified"
        : "failed",
    reason:
      output.answerMatchesSource && output.citationMatches
        ? "verified"
        : "answer-disagreement",
  };
}
/** Required grading read for this task only, after quiescent owned-child cleanup.
 * Caps bound data, not synchronous filesystem latency; same-UID writers are
 * trusted. This is not race-proof openat traversal or network-wire attestation.
 */
export function readResearchGrounding(input: {
  root: ResearchDataRoot | undefined;
  stdout: string;
  response: string;
  executionConfirmed: boolean;
}): ResearchGrounding {
  if (!input.executionConfirmed)
    return unavailableResearchGrounding("execution-unconfirmed");
  if (!input.root) return unavailableResearchGrounding("unsafe-input");
  const root = input.root;
  let fd: number | undefined;
  let reason: ResearchGroundingReason = "unsafe-input";
  try {
    verifyDirectory(root.task, true);
    verifyDirectory(root.data, true);
    const trajectories = directory(join(root.data.path, "trajectories"));
    const path = join(trajectories.path, "trajectory-events.jsonl");
    fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    reason = "unsafe-input";
    // Admit the descriptor first. Filename identity is corroboration, never a
    // check-then-open authority; no content is read before all guards pass.
    const leaf = fstatSync(fd, { bigint: true });
    if (
      !leaf.isFile() ||
      leaf.uid !== BigInt(process.getuid?.() ?? -1) ||
      leaf.nlink !== 1n ||
      (leaf.mode & 0o022n) !== 0n
    )
      throw new Error();
    reason = "truncated-input";
    if (leaf.size > BigInt(RESEARCH_JOURNAL_BYTE_LIMIT)) throw new Error();
    reason = "unsafe-input";
    const verify = () => {
      verifyDirectory(root.task, true);
      verifyDirectory(root.data, true);
      verifyDirectory(trajectories);
      const current = fstatSync(fd as number, { bigint: true });
      const named = lstatSync(path, { bigint: true });
      for (const stat of [current, named]) {
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.uid !== leaf.uid ||
          stat.nlink !== 1n ||
          (stat.mode & 0o022n) !== 0n ||
          stat.dev !== leaf.dev ||
          stat.ino !== leaf.ino ||
          stat.size !== leaf.size ||
          stat.mtimeNs !== leaf.mtimeNs ||
          stat.ctimeNs !== leaf.ctimeNs
        )
          throw new Error();
      }
      if (realpathSync(path) !== path) throw new Error();
    };
    verify();
    const bytes = Buffer.alloc(Number(leaf.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error();
      offset += count;
    }
    verify();
    const stored = bytes.toString("utf8");
    if (!Buffer.from(stored).equals(bytes))
      return unavailableResearchGrounding("invalid-input");
    return projectJournal(stored, input.stdout, input.response);
  } catch (error) {
    return unavailableResearchGrounding(
      record(error) && error.code === "ENOENT" ? "missing-input" : reason,
    );
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* Do not expose raw filesystem errors. */
      }
    }
  }
}
