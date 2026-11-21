import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DESKTOP_RUNTIME_READY_ACK } from "@doolittle/contracts/engine";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { BackendManager } from "../../apps/desktop/src/main/backend";
import { BotCatalog } from "../../apps/desktop/src/main/bot-catalog";
import { BotProcessRegistry } from "../../apps/desktop/src/main/bot-process-registry";
import { registerIpc } from "../../apps/desktop/src/main/ipc";
import { desktopIpcChannels } from "../../apps/desktop/src/shared/ipc-channels";
import { readWorkerBotProfile } from "../../packages/agent/src/runtime/bootstrap/bot-profile";
import { writeJsonAtomicSync } from "../../packages/storage/src/index";

const directories: string[] = [];
function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-startup-test-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runtimeFixture(withHost = false) {
  const directory = createDirectory();
  const marker = join(directory, "launch-environment");
  const acknowledged = join(directory, "host-acknowledged");
  const target = {
    executable: process.execPath,
    args: [
      "-e",
      `require("node:fs").writeFileSync(process.env.DOOLITTLE_TEST_MARKER, process.env.DOOLITTLE_TEST_BRIDGE ?? "");
      if (process.connected) process.on("message", (message) => {
        if (message === ${JSON.stringify(DESKTOP_RUNTIME_READY_ACK)}) {
          require("node:fs").writeFileSync(process.env.DOOLITTLE_TEST_ACK, "ready");
        }
      });
      console.log("API listening on http://127.0.0.1:32769");
      setInterval(() => {}, 1000);`,
    ],
    repoRoot: directory,
    environment: {
      DOOLITTLE_TEST_MARKER: marker,
      DOOLITTLE_TEST_ACK: acknowledged,
      DOOLITTLE_TEST_BRIDGE: "",
    },
  };
  let resolveBridge = () => {};
  const beforeSpawn = new Promise<void>((resolve) => {
    resolveBridge = resolve;
  });
  const runtime = new BackendManager(
    target,
    directory,
    directory,
    async (url) =>
      String(url).endsWith("/runtime/bot-identity")
        ? Response.json({ botId: "default", agentId: "test", name: "Test" })
        : Response.json({ stopped: true }),
    {
      beforeSpawn,
      ...(withHost
        ? { hostRpcBotId: "default", workerHostHandler: async () => undefined }
        : {}),
    },
  );
  return { resolveBridge, marker, acknowledged, runtime, target };
}

it("publishes booting before the capture bridge binds and starts once with its environment", async () => {
  const { resolveBridge, marker, runtime, target } = runtimeFixture();
  const startup = runtime.start();
  try {
    expect(runtime.start()).toBe(startup);
    expect(runtime.getState().phase).toBe("booting");
    expect(existsSync(marker)).toBe(false);
    target.environment.DOOLITTLE_TEST_BRIDGE = "bound";
    resolveBridge();
    await expect(startup).resolves.toMatchObject({ phase: "ready" });
    expect(readFileSync(marker, "utf8")).toBe("bound");
  } finally {
    await runtime.stop();
    resolveBridge();
    await startup;
  }
});

it("never launches a runtime stopped while the capture bridge was binding", async () => {
  const { resolveBridge, marker, runtime } = runtimeFixture();
  const startup = runtime.start();
  await runtime.stop();
  resolveBridge();
  await expect(startup).resolves.toMatchObject({ phase: "stopped" });
  expect(existsSync(marker)).toBe(false);
});

it("acknowledges readiness to the owned child over desktop IPC", async () => {
  const { resolveBridge, acknowledged, runtime } = runtimeFixture(true);
  resolveBridge();
  try {
    await expect(runtime.start()).resolves.toMatchObject({ phase: "ready" });
    await vi.waitFor(() =>
      expect(readFileSync(acknowledged, "utf8")).toBe("ready"),
    );
  } finally {
    await runtime.stop();
  }
});

function desktopIpcFixture(runtime: BackendManager, bots?: BotProcessRegistry) {
  const workspace = {
    currentPath: runtime.getWorkspaceDirectory(),
    recentPaths: [],
  };
  const sender = { sender: { id: 1 } } as IpcMainInvokeEvent;
  const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
  const dispose = registerIpc({
    ipcMain: {
      handle: handlers.set.bind(handlers),
      removeHandler: handlers.delete.bind(handlers),
    } as unknown as IpcMain,
    backend: runtime,
    bots,
    getMainWindow: () => null,
    authorizeSender: (event) => event === sender,
    pickFiles: async () => ({ canceled: true, paths: [] }),
    workspace: {
      getState: () => workspace,
      pickWorkspace: async () => ({ canceled: true, state: workspace }),
      switchWorkspace: async () => ({ canceled: true, state: workspace }),
      subscribe: () => () => undefined,
    },
  });
  return { dispose, handlers, sender };
}

it("loads the editor resolver through trusted desktop IPC and preserves its workspace checks", async () => {
  const { runtime, target } = runtimeFixture();
  const workspacePath = target.repoRoot;
  writeFileSync(join(workspacePath, "main.ts"), "export const count = 1;\n");
  const { dispose, handlers, sender } = desktopIpcFixture(runtime);
  try {
    const invoke = handlers.get(desktopIpcChannels.invoke.editorProjectContext);
    if (!invoke) throw new Error("Editor IPC handler is missing.");
    expect(() => invoke({} as IpcMainInvokeEvent, {})).toThrow(
      "untrusted sender",
    );
    await expect(
      invoke(sender, { workspacePath, entryPath: "main.ts" }),
    ).resolves.toMatchObject({
      workspacePath,
      entryPath: join(workspacePath, "main.ts"),
      revision: expect.any(String),
    });
  } finally {
    dispose();
  }
});

it("refuses a stale conversation inventory read without activating a stopped named bot", async () => {
  const { runtime, target } = runtimeFixture();
  const bots = new BotProcessRegistry(
    target,
    target.repoRoot,
    runtime,
    target.repoRoot,
  );
  const named = bots.create({
    name: "Sleeping bot",
    persona: "Help with coding.",
  });
  const activate = vi.spyOn(bots, "activate");
  const { dispose, handlers, sender } = desktopIpcFixture(runtime, bots);
  try {
    const invoke = handlers.get(desktopIpcChannels.invoke.agentRequest);
    if (!invoke) throw new Error("Agent transport IPC handler is missing.");
    await expect(
      invoke(sender, {
        requestId: "inventory",
        botId: named.id,
        path: "/sessions?limit=200",
        method: "GET",
        headers: {},
      }),
    ).rejects.toThrow("conversation inventory is unavailable");
    expect(activate).not.toHaveBeenCalled();
  } finally {
    dispose();
  }
});

it("publishes private client JSON and cleans up an unsuccessful replacement", () => {
  const directory = createDirectory();
  const path = join(directory, "settings", "state.json");
  writeJsonAtomicSync(
    path,
    { saved: true },
    { indent: 0, trailingNewline: true },
  );
  expect(readFileSync(path, "utf8")).toBe('{"saved":true}\n');
  if (process.platform !== "win32") {
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, "settings")).mode & 0o777).toBe(0o700);
  }
  const occupied = join(directory, "settings", "occupied");
  mkdirSync(occupied);
  expect(() => writeJsonAtomicSync(occupied, { invalid: true })).toThrow();
  expect(readdirSync(join(directory, "settings")).sort()).toEqual([
    "occupied",
    "state.json",
  ]);
});

it("persists a bounded character sheet and accepts it through named runtime validation", () => {
  const directory = createDirectory();
  const backend = {
    getState: () => ({ phase: "stopped" }),
  } as ConstructorParameters<typeof BotCatalog>[1];
  const catalog = new BotCatalog(directory, backend, directory);
  const created = catalog.create({
    name: "Fixture",
    character: {
      system: " Help with coding. ",
      bio: "Guide",
      style: { chat: ["Plain language"] },
      messageExamples: [
        { examples: [{ name: "Fixture", content: { text: "Hi" } }] },
      ],
    },
  });
  const saved = new BotCatalog(directory, backend, directory).get(created.id);
  expect(saved?.character?.system).toBe("Help with coding.");
  expect(() =>
    catalog.update(created.id, {
      character: { system: "Try this", plugins: ["untrusted"] } as never,
    }),
  ).toThrow("unsupported fields");
  expect(catalog.get(created.id)?.character).toEqual(saved?.character);
  expect(
    readWorkerBotProfile({
      DOOLITTLE_BOT_RUNTIME: "worker",
      DOOLITTLE_BOT_PROFILE: JSON.stringify(saved),
    })?.character,
  ).toEqual(saved?.character);
});
