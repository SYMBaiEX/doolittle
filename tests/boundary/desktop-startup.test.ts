import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DESKTOP_RUNTIME_LISTENING,
  DESKTOP_RUNTIME_READY_ACK,
} from "@doolittle/contracts/engine";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import {
  BackendManager,
  sourceRuntimeTarget,
} from "../../apps/desktop/src/main/backend";
import { BotCatalog } from "../../apps/desktop/src/main/bot-catalog";
import { BotProcessRegistry } from "../../apps/desktop/src/main/bot-process-registry";
import { DesktopExecutionAdmission } from "../../apps/desktop/src/main/execution-admission";
import {
  type RegisterIpcDependencies,
  registerIpc,
} from "../../apps/desktop/src/main/ipc";
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
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runtimeFixture(
  withHost = false,
  runtimeFetch: typeof fetch = async (url) =>
    String(url).endsWith("/runtime/bot-identity")
      ? Response.json({ botId: "default", agentId: "test", name: "Test" })
      : Response.json({ ok: true }),
  beforeSpawn?: Promise<void>,
) {
  const directory = createDirectory();
  const marker = join(directory, "launch-environment");
  const acknowledged = join(directory, "host-acknowledged");
  const target = {
    executable: process.execPath,
    args: [
      "-e",
      `require("node:fs").writeFileSync(process.env.DOOLITTLE_TEST_MARKER, process.env.DOOLITTLE_TEST_BRIDGE ?? "");
      if (process.connected) {
        process.on("message", (message) => {
          if (message === ${JSON.stringify(DESKTOP_RUNTIME_READY_ACK)}) {
            require("node:fs").writeFileSync(process.env.DOOLITTLE_TEST_ACK, "ready");
          }
        });
        const type = ${JSON.stringify(DESKTOP_RUNTIME_LISTENING)};
        process.send({ type, url: "http://192.0.2.1:32769" });
        process.send({ type, url: "http://127.0.0.1:65536" });
        process.send({ type, url: "http://127.0.0.1:32769" });
      } else {
        console.log("API listening on http://127.0.0.1:32769");
      }
      setInterval(() => {}, 1000);`,
    ],
    repoRoot: directory,
    environment: {
      DOOLITTLE_TEST_MARKER: marker,
      DOOLITTLE_TEST_ACK: acknowledged,
      DOOLITTLE_TEST_BRIDGE: "",
    },
  };
  const probe = vi.fn(runtimeFetch);
  const runtime = new BackendManager(target, directory, directory, probe, {
    beforeSpawn,
    ...(withHost
      ? { hostRpcBotId: "default", workerHostHandler: async () => undefined }
      : {}),
  });
  return { marker, acknowledged, runtime, target, probe };
}

it("starts once with the capture environment and accepts the listening line without IPC", async () => {
  let finishEnvironment = () => {};
  const environment = new Promise<void>((resolve) => {
    finishEnvironment = resolve;
  });
  const { marker, runtime, target } = runtimeFixture(
    false,
    undefined,
    environment,
  );
  const startup = runtime.start();
  try {
    expect(runtime.start()).toBe(startup);
    expect(runtime.getState().phase).toBe("booting");
    expect(existsSync(marker)).toBe(false);
    target.environment.DOOLITTLE_TEST_BRIDGE = "bound";
    finishEnvironment();
    await expect(startup).resolves.toMatchObject({ phase: "ready" });
    expect(readFileSync(marker, "utf8")).toBe("bound");
  } finally {
    await runtime.stop();
    finishEnvironment();
    await startup;
  }
});

it("does not launch after stopping while the worker is awaiting its capture environment", async () => {
  let finishEnvironment = () => {};
  const environment = new Promise<void>((resolve) => {
    finishEnvironment = resolve;
  });
  const { marker, runtime } = runtimeFixture(false, undefined, environment);
  const startup = runtime.start();
  expect(runtime.getState().phase).toBe("booting");
  await runtime.stop();
  finishEnvironment();
  await expect(startup).resolves.toMatchObject({ phase: "stopped" });
  expect(existsSync(marker)).toBe(false);
});

it("keeps a runtime stopped if its startup health check returns late", async () => {
  let releaseHealth = (_value: Response) => {};
  const health = new Promise<Response>((resolve) => {
    releaseHealth = resolve;
  });
  const { runtime, probe } = runtimeFixture(true, () => health);
  const startup = runtime.start();
  try {
    await vi.waitFor(() => expect(probe).toHaveBeenCalledOnce());
    await runtime.stop();
    releaseHealth(Response.json({ ok: true }));
    await expect(startup).resolves.toMatchObject({ phase: "stopped" });
    expect(probe).toHaveBeenCalledOnce();
  } finally {
    releaseHealth(Response.json({ ok: true }));
    await runtime.stop();
    await startup;
  }
});

it("verifies health and identity before acknowledging a valid private endpoint reported on IPC", async () => {
  const { acknowledged, runtime, probe } = runtimeFixture(true);
  try {
    await expect(runtime.start()).resolves.toMatchObject({
      phase: "ready",
      agentId: "test",
      url: "http://127.0.0.1:32769",
    });
    expect(probe.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:32769/health",
      "http://127.0.0.1:32769/runtime/bot-identity",
    ]);
    await vi.waitFor(() =>
      expect(readFileSync(acknowledged, "utf8")).toBe("ready"),
    );
  } finally {
    await runtime.stop();
  }
});

it("uses embedded Node for Electron source launches and honors the explicit Nub override", () => {
  const directory = createDirectory();
  vi.stubEnv("DOOLITTLE_NUB_PATH", undefined);
  expect(sourceRuntimeTarget(directory, process.execPath)).toEqual({
    executable: process.execPath,
    args: ["apps/cli/dist/managed-runtime.js", "api"],
    repoRoot: directory,
    environment: { ELECTRON_RUN_AS_NODE: "1" },
  });
  const override = join(directory, "nub");
  vi.stubEnv("DOOLITTLE_NUB_PATH", override);
  expect(sourceRuntimeTarget(directory, process.execPath)).toEqual({
    executable: override,
    args: ["apps/cli/dist/managed-runtime.js", "api"],
    repoRoot: directory,
  });
});

function desktopIpcFixture(
  runtime: BackendManager,
  bots?: BotProcessRegistry,
  options: Pick<
    RegisterIpcDependencies,
    "admission" | "sensitiveActionDependencies"
  > = {},
) {
  const workspace = {
    currentPath: runtime.getWorkspaceDirectory(),
    recentPaths: [],
  };
  const sender = {
    sender: Object.assign(new EventEmitter(), { id: 1 }),
  } as unknown as IpcMainInvokeEvent;
  const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
  const dispose = registerIpc({
    ipcMain: {
      handle: handlers.set.bind(handlers),
      removeHandler: handlers.delete.bind(handlers),
    } as unknown as IpcMain,
    backend: runtime,
    bots,
    ...options,
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

it("dispatches an editor save with the approved chat origin and rechecks the workspace after the dialog", async () => {
  const { runtime, target } = runtimeFixture();
  const replacement = realpathSync(createDirectory());
  const project = {
    id: "approved-project",
    name: "Approved project",
    workspacePath: realpathSync(createDirectory()),
  };
  const bots = new BotProcessRegistry(
    target,
    target.repoRoot,
    runtime,
    target.repoRoot,
  );
  const bot = bots.create({
    name: "Local writer",
    persona: "Edit the selected project.",
    permissions: { allowMutation: true },
  });
  const scope = bots.bindConversationWorkspace(
    bot.id,
    "approved-chat",
    project,
  );
  vi.spyOn(bots, "readLeadProject").mockImplementation(async () => project);
  const backendFor = vi.spyOn(bots, "backendFor").mockResolvedValue(runtime);
  const url = "http://127.0.0.1:32769";
  vi.spyOn(runtime, "getState").mockReturnValue({
    phase: "ready",
    url,
    message: "Ready",
  });
  const confirm = vi.fn(async () => true);
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ path: join(project.workspacePath, "main.ts") }),
  );
  const { dispose, handlers, sender } = desktopIpcFixture(runtime, bots, {
    admission: new DesktopExecutionAdmission(),
    sensitiveActionDependencies: { confirm, fetch },
  });
  try {
    const invoke = handlers.get(
      desktopIpcChannels.invoke.workspaceSaveConfirmed,
    );
    if (!invoke) throw new Error("Workspace save handler is missing.");
    const write = {
      path: "main.ts",
      expectedContent: "export const count = 1;\n",
      content: "export const count = 2;\n",
    };
    const request = {
      ...write,
      botId: bot.id,
      originConversationId: scope.sessionId,
      workspacePath: project.workspacePath,
    };
    confirm.mockResolvedValueOnce(false);
    await expect(invoke(sender, request)).resolves.toEqual({
      status: "cancelled",
    });
    expect(fetch).not.toHaveBeenCalled();

    await expect(invoke(sender, request)).resolves.toEqual({
      status: "saved",
      path: join(project.workspacePath, "main.ts"),
    });
    expect(backendFor).toHaveBeenCalledWith(bot.id);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${url}/workspace/write`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-doolittle-origin-conversation": scope.sessionId,
      },
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(write);

    await expect(
      invoke(sender, { ...request, overwrite: true }),
    ).resolves.toEqual({
      status: "saved",
      path: join(project.workspacePath, "main.ts"),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      ...write,
      overwrite: true,
    });

    confirm.mockImplementationOnce(async () => {
      project.workspacePath = replacement;
      return true;
    });
    await expect(invoke(sender, request)).rejects.toThrow(
      "Conversation project root changed",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    dispose();
  }
});

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

it("cancels a pending search before the bot runtime opens its transport", async () => {
  const { runtime, target } = runtimeFixture();
  const bots = new BotProcessRegistry(
    target,
    target.repoRoot,
    runtime,
    target.repoRoot,
  );
  let finishStart = (_runtime: BackendManager) => {};
  const starting = new Promise<BackendManager>((resolve) => {
    finishStart = resolve;
  });
  const backendFor = vi.spyOn(bots, "backendFor").mockReturnValue(starting);
  const { dispose, handlers, sender } = desktopIpcFixture(runtime, bots);
  try {
    const request = handlers.get(desktopIpcChannels.invoke.agentRequest);
    const cancel = handlers.get(desktopIpcChannels.invoke.agentRequestCancel);
    if (!request || !cancel)
      throw new Error("Agent transport IPC handlers are missing.");

    const pending = request(sender, {
      requestId: "superseded-search",
      path: "/workspace/search?query=old",
      method: "GET",
      headers: {},
    });
    const cancelled = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(backendFor).toHaveBeenCalledOnce());
    expect(() => cancel(sender, "superseded-search", "other")).toThrow(
      "different bot",
    );
    cancel(sender, "superseded-search");
    await cancelled;
  } finally {
    finishStart(runtime);
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
