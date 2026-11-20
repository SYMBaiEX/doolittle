import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  importLegacyConversations,
  legacyProfileId,
} from "@doolittle/agent/services/session/legacy-profile";
import type { BotDefinition } from "@doolittle/contracts";
import { readRegularFileSync } from "@doolittle/storage";
import { BotCatalog, readStoredBotProfiles } from "./bot-catalog";
import {
  BotConversationLedger,
  type BoundConversation,
} from "./bot-conversation-ledger";

function optionalEntry(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function owned(entry: NonNullable<ReturnType<typeof optionalEntry>>): boolean {
  return (
    process.platform === "win32" ||
    (entry.uid === process.getuid?.() && (entry.mode & 0o022) === 0)
  );
}

function optionalOwnedDirectory(path: string): boolean {
  const entry = optionalEntry(path);
  if (!entry) return false;
  if (!entry.isDirectory() || !owned(entry) || realpathSync(path) !== path) {
    throw new Error("Legacy profile directory is not a local owned directory.");
  }
  return true;
}

function verifyOptionalFile(path: string): boolean {
  const entry = optionalEntry(path);
  if (!entry) return false;
  if (!entry.isFile() || !owned(entry) || entry.nlink !== 1) {
    throw new Error("Legacy profile metadata is not an owned file.");
  }
  return true;
}

function readLastWorkspace(root: string): unknown {
  const path = join(root, "workspace-state.json");
  if (!verifyOptionalFile(path)) return undefined;
  const bytes = readRegularFileSync(path, 64_000, { singleLink: true });
  try {
    return (
      JSON.parse(bytes.toString("utf8")) as { currentPath?: unknown } | null
    )?.currentPath;
  } catch (error) {
    // A damaged workspace picker record confers no scope. Ledger-bound chats
    // can still be read without relying on it.
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export interface LegacySessionProfile {
  dataDir: string;
  bot?: Pick<BotDefinition, "id" | "name" | "persona" | "character" | "avatar">;
  conversations: Array<
    Pick<BoundConversation, "sessionId" | "projectId" | "workspacePath">
  >;
}

export function readLegacyDesktopProfile(
  root: string,
  workspace: string,
):
  | {
      runtimeDataDir: string;
      isLastWorkspace: boolean;
      sessionProfiles: LegacySessionProfile[];
      skippedConversations: number;
    }
  | undefined {
  if (!isAbsolute(root) || !optionalOwnedDirectory(root)) return undefined;
  const runtimeDataDir = join(root, "runtime");
  if (!optionalOwnedDirectory(runtimeDataDir)) return undefined;
  const isLastWorkspace = readLastWorkspace(root) === workspace;
  const botsDir = join(runtimeDataDir, "bots");
  const sessionProfiles: LegacySessionProfile[] = [];
  let skippedConversations = 0;
  if (optionalOwnedDirectory(botsDir)) {
    for (const file of [
      "catalog.json",
      "conversation-owners.json",
      "conversation-owners.backup.json",
    ])
      verifyOptionalFile(join(botsDir, file));
    const bots = readStoredBotProfiles(runtimeDataDir);
    const ledger = new BotConversationLedger(runtimeDataDir, { repair: false });
    const candidates = (botId: string, scratch?: string) =>
      ledger.list(botId).flatMap((record) => {
        if (scratch && record.workspacePath === scratch && !record.projectId)
          return [{ ...record, workspacePath: workspace }];
        if (
          record.workspacePath === workspace ||
          (!record.workspacePath && record.projectId)
        )
          return [record];
        if (!record.workspacePath && isLastWorkspace) skippedConversations += 1;
        return [];
      });
    const lead = candidates(bots.lead);
    if (lead.length)
      sessionProfiles.push({ dataDir: runtimeDataDir, conversations: lead });
    for (const bot of bots.named) {
      const scratch = join(runtimeDataDir, "bot-workspaces", bot.id);
      const ownsScratch =
        isLastWorkspace &&
        bot.workspacePath === scratch &&
        optionalOwnedDirectory(scratch);
      const conversations = candidates(
        bot.id,
        ownsScratch ? scratch : undefined,
      );
      if (bot.archivedAt) {
        skippedConversations += conversations.length;
        continue;
      }
      const dataDir = join(botsDir, bot.id);
      const definition = {
        id: bot.id,
        name: bot.name,
        persona: bot.persona,
        character: bot.character,
        avatar: bot.avatar,
      };
      if (
        conversations.length ||
        ownsScratch ||
        bot.workspacePath === workspace
      ) {
        optionalOwnedDirectory(dataDir);
        sessionProfiles.push({ dataDir, bot: definition, conversations });
      }
    }
  }
  return {
    runtimeDataDir,
    isLastWorkspace,
    sessionProfiles,
    skippedConversations,
  };
}

export interface ProfileMigration {
  importedConversations: number;
  skippedConversations: number;
  settingsImported: boolean;
  deferred: boolean;
}

export function restoreLegacyDesktopConversations(input: {
  source: NonNullable<ReturnType<typeof readLegacyDesktopProfile>>;
  destination: string;
  workspace: string;
  lead: { id: string; name: string };
  report: ProfileMigration;
  withinBudget: () => boolean;
}): void {
  const { source, destination, workspace, lead, report } = input;
  report.skippedConversations += source.skippedConversations;
  if (!source.sessionProfiles.length) return;
  const botsDir = join(destination, "bots");
  mkdirSync(botsDir, { recursive: true, mode: 0o700 });
  optionalOwnedDirectory(botsDir);
  const catalog = new BotCatalog(
    destination,
    {
      getState: () => ({
        phase: "ready",
        agentId: lead.id,
        name: lead.name,
        message: "",
      }),
      getWorkspaceDirectory: () => workspace,
    },
    workspace,
  );
  const owners = new BotConversationLedger(destination);
  for (const profile of source.sessionProfiles) {
    let owner = lead.id;
    let chatWorkspace = workspace;
    let dataDir = destination;
    try {
      if (profile.bot) {
        const { id, ...definition } = profile.bot;
        const botId = legacyProfileId(profile.dataDir, `bot:${id}`);
        const agentId = legacyProfileId(profile.dataDir, `agent:${id}`);
        const scratchParent = join(destination, "bot-workspaces");
        const scratch = join(scratchParent, botId);
        optionalOwnedDirectory(scratchParent);
        optionalOwnedDirectory(scratch);
        const bot = catalog.restorePrivateBot(definition, botId, agentId);
        if (!bot || bot.workspacePath !== scratch) {
          report.skippedConversations += profile.conversations.length;
          continue;
        }
        owner = botId;
        chatWorkspace = scratch;
        dataDir = join(botsDir, botId);
        optionalOwnedDirectory(dataDir);
      }
      verifyOptionalFile(join(dataDir, "state.db"));
      const result = importLegacyConversations({
        sourceDataDir: profile.dataDir,
        destinationDataDir: dataDir,
        workspace,
        conversations: profile.conversations,
        withinBudget: input.withinBudget,
        admit(sessionId) {
          const existing = owners.get(sessionId);
          return (
            !existing ||
            (existing.botId === owner &&
              existing.workspacePath === chatWorkspace &&
              !existing.projectId)
          );
        },
        bind(sessionId) {
          owners.bind(owner, sessionId, undefined, chatWorkspace);
        },
      });
      report.importedConversations += result.imported;
      report.skippedConversations += result.skipped;
      if (result.deferred) {
        report.deferred = true;
        break;
      }
    } catch {
      report.deferred = true;
    }
  }
}
