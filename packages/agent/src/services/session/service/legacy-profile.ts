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
import { join } from "node:path";
import {
  DEFAULT_MODEL_ROUTE,
  isModelProviderId,
  isRuntimeReasoningEffort,
} from "@doolittle/contracts/model-route";
import { RUN_DEPTHS, TOOL_PROGRESS_MODES } from "@doolittle/contracts/run";
import { readRegularFileSync } from "@doolittle/storage";
import { writeJsonAtomicSync } from "@elizaos/core";
import { resolveTuiThemeName } from "../../../runtime/theme-catalog/index";
import {
  MAX_SESSION_ARCHIVE_BYTES,
  MAX_SESSION_ARCHIVE_MESSAGES,
  SessionTransferError,
} from "../../session-transfer";
import type { ParsedRuntimeSettings } from "../../settings/runtime-settings";
import { NodeSessionDatabase } from "../database";
import { composeSessionServiceState } from "./composition";
import { createSessionDatabase } from "./support";

function entry(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function ownedRegularFile(path: string) {
  const stat = entry(path);
  if (!stat) return undefined;
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    realpathSync(path) !== path ||
    (process.platform !== "win32" &&
      (stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0))
  )
    throw new Error("Legacy profile file is not an owned regular file.");
  return stat;
}

export function legacyProfileId(namespace: string, identity: string): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        "doolittle-native-legacy-profile-v1",
        namespace,
        identity,
      ]),
    )
    .digest("hex");
  // Format the deterministic digest as an RFC 9562 custom version 8 UUID.
  const variant = (Number.parseInt(hash[16], 16) & 3) | 8;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${variant.toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function openLegacyDatabase(path: string): NodeSessionDatabase | undefined {
  const expected = ownedRegularFile(path);
  if (!expected) return undefined;
  if (["-wal", "-shm", "-journal"].some((suffix) => entry(path + suffix))) {
    throw new Error("Legacy SQLite has an active journal.");
  }
  const fd = openSync(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const stat = fstatSync(fd);
    const bytes = Buffer.alloc(20);
    if (
      stat.dev !== expected.dev ||
      stat.ino !== expected.ino ||
      readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length ||
      bytes.toString("ascii", 0, 16) !== "SQLite format 3\0" ||
      bytes[18] !== 1 ||
      bytes[19] !== 1
    )
      throw new Error("Legacy SQLite is not a rollback-journal database.");
  } finally {
    closeSync(fd);
  }
  return new NodeSessionDatabase(path, { readOnly: true });
}

export function importLegacyConversations(input: {
  sourceDataDir: string;
  destinationDataDir: string;
  workspace: string;
  conversations: readonly {
    sessionId: string;
    workspacePath?: string;
    projectId?: string;
  }[];
  admit(sessionId: string): boolean;
  bind(sessionId: string): void;
  withinBudget(): boolean;
}): { imported: number; skipped: number; deferred: boolean } {
  const { conversations, workspace, sourceDataDir } = input;
  if (!conversations.length)
    return { imported: 0, skipped: 0, deferred: false };
  const sourcePath = join(sourceDataDir, "state.db");
  const source = openLegacyDatabase(sourcePath);
  if (!source)
    return { imported: 0, skipped: conversations.length, deferred: false };
  let target: ReturnType<typeof createSessionDatabase> | undefined;
  let imported = 0;
  let skipped = 0;
  try {
    source.exec(
      "PRAGMA trusted_schema = OFF; PRAGMA query_only = ON; PRAGMA busy_timeout = 100; BEGIN",
    );
    const old = composeSessionServiceState(source);
    const archiveSize = source.query(`
      SELECT COUNT(*) AS messages, SUM(bytes) AS bytes FROM (
        SELECT octet_length(text) + COALESCE(octet_length(attachments_json), 0) AS bytes
        FROM messages WHERE session_id = ? LIMIT ?
      )
    `);
    const destination = () => {
      target ??= createSessionDatabase(input.destinationDataDir);
      return composeSessionServiceState(target).transfers;
    };
    let transfers: ReturnType<typeof destination> | undefined;
    for (const record of conversations) {
      const sourceId = record.sessionId;
      if (
        record.workspacePath !== workspace &&
        !(
          !record.workspacePath &&
          record.projectId &&
          old.projects.projectIdForSession(sourceId) === record.projectId &&
          old.projects.get(record.projectId)?.primaryPath === workspace
        )
      ) {
        skipped += 1;
        continue;
      }
      const sessionId = legacyProfileId(sourcePath, sourceId);
      if (!input.admit(sessionId)) {
        skipped += 1;
        continue;
      }
      try {
        if (transfers || entry(join(input.destinationDataDir, "state.db"))) {
          transfers ??= destination();
          const status = transfers.legacyImportStatus(sourceId, sessionId);
          if (status === "existing") {
            input.bind(sessionId);
            continue;
          }
          if (status === "conflict") {
            skipped += 1;
            continue;
          }
        }
        const size = archiveSize.get(
          sourceId,
          MAX_SESSION_ARCHIVE_MESSAGES + 1,
        ) as { bytes: number | null; messages: number };
        if (
          !size.messages ||
          size.messages > MAX_SESSION_ARCHIVE_MESSAGES ||
          (size.bytes ?? 0) > MAX_SESSION_ARCHIVE_BYTES
        ) {
          skipped += 1;
          continue;
        }
        if (!input.withinBudget()) return { imported, skipped, deferred: true };
        const archive = old.transfers.exportSessionArchive(sourceId);
        transfers ??= destination();
        const result = transfers.importLegacySessionArchive(archive, sessionId);
        if (result === "conflict") {
          skipped += 1;
          continue;
        }
        input.bind(sessionId);
        if (result === "imported") imported += 1;
      } catch (error) {
        // Unsupported/oversized sessions remain available in the Electron source.
        if (!(error instanceof SessionTransferError)) throw error;
        skipped += 1;
      }
    }
  } catch {
    return { imported, skipped, deferred: true };
  } finally {
    try {
      source.close();
    } finally {
      target?.close();
    }
  }
  return { imported, skipped, deferred: false };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= max
  );
}

function inList<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

function portableSettings(value: unknown): ParsedRuntimeSettings {
  const old = record(value);
  const model = record(old.model);
  const agent = record(old.agent);
  const ui = record(old.ui);
  const settings: ParsedRuntimeSettings = {};
  const modelSettings: NonNullable<ParsedRuntimeSettings["model"]> = {};
  const agentSettings: NonNullable<ParsedRuntimeSettings["agent"]> = {};
  if (
    isModelProviderId(model.provider) &&
    typeof model.model === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9./:_@-]{0,159}$/u.test(model.model) &&
    (model.baseUrl === undefined ||
      model.baseUrl === "" ||
      (model.provider === DEFAULT_MODEL_ROUTE.provider &&
        model.baseUrl === DEFAULT_MODEL_ROUTE.baseUrl))
  ) {
    modelSettings.provider = model.provider;
    modelSettings.model = model.model;
    modelSettings.baseUrl = model.baseUrl ?? "";
  }
  if (isRuntimeReasoningEffort(model.reasoningEffort))
    modelSettings.reasoningEffort = model.reasoningEffort;
  if (integer(model.maxTokens, 1_000_000))
    modelSettings.maxTokens = model.maxTokens;
  if (
    typeof model.temperature === "number" &&
    model.temperature >= 0 &&
    model.temperature <= 2
  )
    modelSettings.temperature = model.temperature;
  if (inList(RUN_DEPTHS, agent.runDepth))
    agentSettings.runDepth = agent.runDepth;
  if (inList(TOOL_PROGRESS_MODES, agent.toolProgressMode))
    agentSettings.toolProgressMode = agent.toolProgressMode;
  if (integer(agent.maxIterations, 1_000))
    agentSettings.maxIterations = agent.maxIterations;
  const theme =
    typeof ui.theme === "string" && ui.theme.length <= 80
      ? resolveTuiThemeName(ui.theme)
      : undefined;
  if (Object.keys(modelSettings).length) settings.model = modelSettings;
  if (Object.keys(agentSettings).length) settings.agent = agentSettings;
  if (theme) settings.ui = { theme };
  return settings;
}

export function importLegacySettings(
  sourceDataDir: string,
  destinationDataDir: string,
): boolean {
  const destination = join(destinationDataDir, "settings.json");
  if (entry(destination)) return false;
  const source = join(sourceDataDir, "settings.json");
  if (!ownedRegularFile(source)) return false;
  const settings = portableSettings(
    JSON.parse(
      readRegularFileSync(source, 1024 * 1024, { singleLink: true }).toString(
        "utf8",
      ),
    ),
  );
  if (!Object.keys(settings).length) return false;
  // This runs under the native host's exclusive profile lease, before runtime
  // services can open settings. Rename publication leaves a single file even
  // if the host terminates immediately after it becomes visible.
  if (entry(destination)) return false;
  writeJsonAtomicSync(destination, settings);
  return true;
}
