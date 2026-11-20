import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { prepareLegacyProfileMigration } from "../../apps/cli/src/entrypoint/native-legacy-profile";
import { BotCatalog } from "../../apps/desktop/src/main/bot-catalog";
import { BotConversationLedger } from "../../apps/desktop/src/main/bot-conversation-ledger";
import {
  readLegacyDesktopProfile,
  restoreLegacyDesktopConversations,
} from "../../apps/desktop/src/main/legacy-profile-source";
import { composeSessionServiceState } from "../../packages/agent/src/services/session/service/composition";
import { legacyProfileId } from "../../packages/agent/src/services/session/service/legacy-profile";
import { createSessionDatabase } from "../../packages/agent/src/services/session/service/support";

const paths: string[] = [];
const oldLead = { id: randomUUID(), name: "Old Doolittle" };
const lead = { id: randomUUID(), name: "Doolittle" };

afterEach(() => {
  while (paths.length)
    rmSync(paths.pop() as string, { recursive: true, force: true });
});

function fixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-profile-migration-")),
  );
  paths.push(root);
  const legacy = join(root, "Doolittle");
  const runtime = join(legacy, "runtime");
  const destination = join(root, "Doolittle Native");
  const workspace = join(root, "checkout");
  const otherWorkspace = join(root, "other-checkout");
  for (const path of [
    join(runtime, "bots"),
    destination,
    workspace,
    otherWorkspace,
  ]) {
    mkdirSync(path, { mode: 0o700, recursive: true });
  }
  writeFileSync(
    join(legacy, "workspace-state.json"),
    JSON.stringify({ currentPath: workspace }),
  );
  const catalog = new BotCatalog(
    runtime,
    {
      getState: () => ({
        phase: "ready",
        agentId: oldLead.id,
        name: oldLead.name,
        message: "",
      }),
      getWorkspaceDirectory: () => workspace,
    },
    workspace,
  );
  catalog.defaultBot();
  return {
    root,
    legacy,
    runtime,
    destination,
    workspace,
    otherWorkspace,
    catalog,
    owners: new BotConversationLedger(runtime),
    marker: join(destination, "legacy-desktop-profile-v1.json"),
  };
}

function state<T>(
  dataDir: string,
  use: (sessions: ReturnType<typeof composeSessionServiceState>) => T,
): T {
  const database = createSessionDatabase(dataDir);
  try {
    return use(composeSessionServiceState(database));
  } finally {
    database.close();
  }
}

function storeMessage(dataDir: string, sessionId: string, text: string): void {
  state(dataDir, (sessions) =>
    sessions.writes.storeMessage({
      id: randomUUID(),
      sessionId,
      roomId: sessionId,
      entityId: "local-user",
      role: "user",
      text,
      createdAt: "2026-08-12T15:00:00.000Z",
    }),
  );
}

function migratedId(dataDir: string, sessionId: string): string {
  return legacyProfileId(join(dataDir, "state.db"), sessionId);
}

it("resumes a bounded first launch and skips an oversized conversation", () => {
  const { legacy, runtime, destination, workspace, owners } = fixture();
  owners.bind(oldLead.id, "first-chat", undefined, workspace);
  owners.bind(oldLead.id, "second-chat", undefined, workspace);
  owners.bind(oldLead.id, "oversized-chat", undefined, workspace);
  storeMessage(runtime, "first-chat", "First history");
  storeMessage(runtime, "second-chat", "Second history");
  storeMessage(runtime, "oversized-chat", "x".repeat(2_000_001));
  const report = {
    importedConversations: 0,
    skippedConversations: 0,
    settingsImported: false,
    deferred: false,
  };
  const source = readLegacyDesktopProfile(legacy, workspace);
  if (!source) throw new Error("The fixture profile was not readable.");
  let admitted = 0;
  restoreLegacyDesktopConversations({
    source,
    destination,
    workspace,
    lead,
    report,
    withinBudget: () => ++admitted <= 1,
  });
  expect(report).toMatchObject({ importedConversations: 1, deferred: true });
  expect(
    prepareLegacyProfileMigration(legacy, destination, workspace)?.finish(lead),
  ).toMatchObject({
    importedConversations: 1,
    skippedConversations: 1,
    deferred: false,
  });
  for (const id of ["first-chat", "second-chat"]) {
    expect(
      state(destination, (sessions) =>
        sessions.reads.messagesBySession(migratedId(runtime, id), 10),
      ),
    ).toHaveLength(1);
  }
});

it("restores owned chats and safe preferences once, with private named history", () => {
  const setup = fixture();
  const {
    legacy,
    runtime,
    destination,
    workspace,
    otherWorkspace,
    catalog,
    owners,
    marker,
  } = setup;
  const legacyBot = catalog.create({
    name: "Reader",
    persona: "Read code carefully.",
    workspacePath: workspace,
    model: { provider: "anthropic", model: "model" },
    permissions: {
      allowMutation: true,
      allowDelegation: true,
      connectionIds: ["legacy-connector"],
      toolIds: ["shell"],
    },
  });
  const unstartedBot = catalog.create({
    name: "Unstarted",
    persona: "Help with project notes.",
    workspacePath: workspace,
  });
  const namedData = join(runtime, "bots", legacyBot.id);
  owners.bind(oldLead.id, "lead-here", undefined, workspace);
  owners.bind(oldLead.id, "lead-elsewhere", undefined, otherWorkspace);
  owners.bind(oldLead.id, "legacy-unbound");
  owners.bind(legacyBot.id, "worker-here", "historical-project", workspace);
  for (const id of ["lead-here", "lead-elsewhere", "legacy-unbound"])
    storeMessage(runtime, id, id);
  storeMessage(namedData, "worker-here", "Named history");
  const sourceDb = join(runtime, "state.db");
  const sourceBefore = readFileSync(sourceDb);
  // Migration may recover a missing primary ledger but must never repair the old source.
  const primaryLedger = join(runtime, "bots", "conversation-owners.json");
  rmSync(primaryLedger);
  const legacySettings = {
    model: {
      provider: "anthropic",
      model: "model",
      baseUrl: "https://custom.example",
      maxTokens: 512,
    },
    ui: { theme: "manga" },
    agent: { runDepth: "deep" },
    execution: { backend: "ssh", sshHost: "elsewhere.example" },
    mcp: { servers: [{ env: { SECRET: "fixture-credential" } }] },
  };
  writeFileSync(join(runtime, "settings.json"), JSON.stringify(legacySettings));
  writeFileSync(join(runtime, "secrets.json"), "fixture-secret");

  expect(
    prepareLegacyProfileMigration(legacy, destination, workspace)?.finish(lead),
  ).toEqual({
    importedConversations: 2,
    skippedConversations: 1,
    settingsImported: true,
    deferred: false,
  });
  expect(
    JSON.parse(readFileSync(join(destination, "settings.json"), "utf8")),
  ).toMatchObject({
    model: { maxTokens: 512 },
    agent: { runDepth: "deep" },
  });
  expect(readFileSync(join(destination, "settings.json"), "utf8")).not.toMatch(
    /custom\.example|fixture-credential|ssh/,
  );
  expect(existsSync(join(destination, "secrets.json"))).toBe(false);
  expect(existsSync(primaryLedger)).toBe(false);
  expect(readFileSync(sourceDb)).toEqual(sourceBefore);
  const restoredId = migratedId(runtime, "lead-here");
  const namedId = legacyProfileId(namedData, `bot:${legacyBot.id}`);
  const namedConversationId = migratedId(namedData, "worker-here");
  const scratch = join(destination, "bot-workspaces", namedId);
  const targetOwners = new BotConversationLedger(destination);
  expect(targetOwners.get(restoredId)).toMatchObject({
    botId: lead.id,
    workspacePath: workspace,
  });
  expect(targetOwners.get(namedConversationId)).toMatchObject({
    botId: namedId,
    workspacePath: scratch,
  });
  expect(targetOwners.get(namedConversationId)?.projectId).toBeUndefined();
  const targetCatalog = new BotCatalog(
    destination,
    {
      getState: () => ({ phase: "ready", agentId: lead.id, message: "" }),
      getWorkspaceDirectory: () => workspace,
    },
    workspace,
  );
  expect(targetCatalog.get(namedId)).toMatchObject({
    name: "Reader",
    persona: "Read code carefully.",
    model: { provider: "offline", model: "offline" },
    permissions: {
      workspacePaths: [scratch],
      connectionIds: [],
      toolIds: [],
      allowMutation: false,
      allowDelegation: false,
    },
  });
  expect(
    targetCatalog.get(
      legacyProfileId(
        join(runtime, "bots", unstartedBot.id),
        `bot:${unstartedBot.id}`,
      ),
    )?.name,
  ).toBe("Unstarted");
  expect(
    state(destination, (sessions) =>
      sessions.reads.messagesBySession(restoredId, 10),
    ),
  ).toMatchObject([{ text: "lead-here" }]);
  expect(
    state(destination, (sessions) =>
      sessions.reads.messagesBySession(
        migratedId(runtime, "lead-elsewhere"),
        10,
      ),
    ),
  ).toEqual([]);
  expect(
    state(destination, (sessions) =>
      sessions.reads.messagesBySession(namedConversationId, 10),
    ),
  ).toEqual([]);
  expect(
    state(join(destination, "bots", namedId), (sessions) =>
      sessions.reads.messagesBySession(namedConversationId, 10),
    ),
  ).toMatchObject([{ text: "Named history" }]);

  expect(
    prepareLegacyProfileMigration(legacy, destination, workspace),
  ).toBeUndefined();
  // Simulate an interrupted publication and a native user modifying an imported session.
  rmSync(marker);
  storeMessage(destination, restoredId, "Native follow-up");
  expect(
    prepareLegacyProfileMigration(legacy, destination, workspace)?.finish(lead),
  ).toMatchObject({
    importedConversations: 0,
    skippedConversations: 1,
    settingsImported: false,
    deferred: false,
  });
  const restored = state(destination, (sessions) =>
    sessions.reads.messagesBySession(restoredId, 10),
  );
  expect(restored.map((message) => message.text).sort()).toEqual([
    "Native follow-up",
    "lead-here",
  ]);
});

it("defers a live legacy file and retries without overwriting native settings or rooms", () => {
  const { legacy, runtime, destination, workspace, owners, marker } = fixture();
  owners.bind(oldLead.id, "busy-old-chat", undefined, workspace);
  owners.bind(oldLead.id, "conflicting-old-chat", undefined, workspace);
  for (const id of ["busy-old-chat", "conflicting-old-chat"])
    storeMessage(runtime, id, id);
  const nativeSettings = '{"agent":{"maxIterations":4}}';
  writeFileSync(join(destination, "settings.json"), nativeSettings);
  writeFileSync(
    join(runtime, "settings.json"),
    '{"agent":{"maxIterations":7}}',
  );
  const conflictId = migratedId(runtime, "conflicting-old-chat");
  storeMessage(destination, conflictId, "Preexisting native chat");
  const journal = join(runtime, "state.db-journal");
  writeFileSync(journal, "busy legacy marker");
  expect(
    prepareLegacyProfileMigration(legacy, destination, workspace)?.finish(lead),
  ).toEqual({
    importedConversations: 0,
    skippedConversations: 0,
    settingsImported: false,
    deferred: true,
  });
  expect(existsSync(marker)).toBe(false);
  rmSync(journal);
  expect(
    prepareLegacyProfileMigration(legacy, destination, workspace)?.finish(lead),
  ).toEqual({
    importedConversations: 1,
    skippedConversations: 1,
    settingsImported: false,
    deferred: false,
  });
  expect(readFileSync(join(destination, "settings.json"), "utf8")).toBe(
    nativeSettings,
  );
  expect(new BotConversationLedger(destination).get(conflictId)).toBeNull();
  expect(
    state(destination, (sessions) =>
      sessions.reads.messagesBySession(conflictId, 10),
    ),
  ).toMatchObject([{ text: "Preexisting native chat" }]);
});

it.skipIf(process.platform === "win32")(
  "does not open a symlinked Electron profile",
  () => {
    const { root, legacy, destination, workspace, marker } = fixture();
    const link = join(root, "alias");
    symlinkSync(legacy, link, "dir");
    expect(
      prepareLegacyProfileMigration(link, destination, workspace)?.finish(lead),
    ).toMatchObject({
      importedConversations: 0,
      settingsImported: false,
      deferred: true,
    });
    expect(existsSync(marker)).toBe(false);
  },
);
