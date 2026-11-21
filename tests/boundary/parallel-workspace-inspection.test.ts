import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ActionParameters,
  type IAgentRuntime,
  type Memory,
  validateActionParams,
} from "@elizaos/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCodingAction } from "../../packages/agent/src/actions/coding-action";
import {
  createParallelWorkspaceInspectionAction,
  PARALLEL_WORKSPACE_INSPECTION,
} from "../../packages/agent/src/actions/parallel-workspace-inspection";
import { runWithTurnRuntimeScope } from "../../packages/agent/src/runtime/turn-runtime-scope";
import { runWithConversationWorkspace } from "../../packages/agent/src/runtime/workspace-scope";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service/index";

const runtime = { getSetting: () => undefined } as unknown as IAgentRuntime;
const message = (source: string): Memory =>
  ({ content: { text: "Inspect the selected repository", source } }) as Memory;
const search = (query: string) => ({ kind: "search", path: ".", query });
let fixture: string;

beforeEach(async () => {
  fixture = await realpath(
    await mkdtemp(join(tmpdir(), "doolittle-parallel-inspection-")),
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(fixture, { recursive: true, force: true });
});

function inspect(
  workspace: Pick<WorkspaceService, "root" | "search">,
  tasks: ActionParameters["tasks"],
  source = "cli",
) {
  return createParallelWorkspaceInspectionAction(workspace).handler(
    runtime,
    message(source),
    undefined,
    { parameters: { tasks } },
  );
}

it("exposes structured SDK parameters in the native coding planner", () => {
  const action = createParallelWorkspaceInspectionAction(
    new WorkspaceService(fixture),
  );
  expect(createCodingAction().subActions).toContain(
    PARALLEL_WORKSPACE_INSPECTION,
  );
  expect(
    validateActionParams(action, {
      tasks: [
        { kind: "read", path: "router.ts", fromLine: 1 },
        search("createRouter"),
      ],
    }).valid,
  ).toBe(true);
});

it("runs at most two concurrent inspections and returns evidence in task order", async () => {
  let finishFirst = () => {};
  const first = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const find = vi.fn(async (query: string) => {
    if (query === "first") await first;
    return [{ path: "app.ts", matches: [`result ${query}`] }];
  });

  const running = inspect({ root: () => fixture, search: find }, [
    search("first"),
    search("second"),
    search("third"),
  ]);
  try {
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(2));
    expect(find.mock.calls.map(([query]) => query)).toEqual([
      "first",
      "second",
    ]);
  } finally {
    finishFirst();
  }
  const result = await running;
  expect(result).toMatchObject({
    success: true,
    continueChain: true,
    data: {
      results: [
        { evidence: "app.ts\nresult first" },
        { evidence: "app.ts\nresult second" },
        { evidence: "app.ts\nresult third" },
      ],
    },
  });
});

it("returns real file and test-search evidence from the bound desktop project", async () => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  const project = join(fixture, "project");
  await mkdir(join(project, "tests"), { recursive: true });
  await writeFile(
    join(project, "router.ts"),
    "// skipped\nexport function home() {}\n",
  );
  await writeFile(
    join(project, "tests", "router.test.ts"),
    "import { home } from '../router';\n",
  );
  await writeFile(join(fixture, "router.ts"), "outside the selected project\n");
  await writeFile(join(project, ".env"), "synthetic-hidden-token\n");
  await symlink(join(project, ".env"), join(project, "alias.ts"));
  await symlink(join(fixture, "router.ts"), join(project, "outside.ts"));
  const workspace = new WorkspaceService(fixture);
  const tasks: ActionParameters[] = [
    { kind: "read", path: "router.ts", fromLine: 2 },
    { kind: "search", path: "tests", query: "home" },
    { kind: "read", path: ".env" },
    { kind: "read", path: "alias.ts" },
    { kind: "read", path: "outside.ts" },
    { kind: "read", path: "../router.ts" },
  ];
  await expect(inspect(workspace, tasks, "desktop")).rejects.toThrow(
    "A bound conversation workspace is required.",
  );
  const result = await runWithConversationWorkspace(
    { sessionId: "room", botId: "default", workspacePath: project },
    () => inspect(workspace, tasks, "desktop"),
  );
  expect(result).toMatchObject({
    success: true,
    data: {
      results: [
        {
          success: true,
          evidence: expect.stringContaining("2: export function home() {}"),
        },
        { success: true, evidence: expect.stringContaining("router.test.ts") },
        { success: false },
        { success: false },
        { success: false },
        { success: false },
      ],
    },
  });
  expect(result).not.toHaveProperty("data.mutation");
  expect(JSON.stringify(result)).not.toContain("synthetic-hidden-token");
  expect(JSON.stringify(result)).not.toContain("outside the selected project");
  await expect(readFile(join(project, "router.ts"), "utf8")).resolves.toBe(
    "// skipped\nexport function home() {}\n",
  );
});

it("rejects connector requests and non-inspection tasks before touching the workspace", async () => {
  const root = vi.fn(() => fixture);
  const workspace = { root, search: vi.fn() };
  await expect(
    inspect(workspace, [search("one"), search("two")], "telegram"),
  ).resolves.toMatchObject({ success: false });
  await expect(
    inspect(workspace, [
      search("one"),
      { kind: "shell", path: ".", command: "pwd" },
    ]),
  ).resolves.toMatchObject({ success: false });
  await expect(
    inspect(workspace, [search("one"), { ...search("two"), workdir: "/tmp" }]),
  ).resolves.toMatchObject({ success: false });
  await expect(inspect(workspace, [search("one")])).resolves.toMatchObject({
    success: false,
  });
  await expect(
    inspect(
      workspace,
      Array.from({ length: 7 }, (_, index) => search(String(index))),
    ),
  ).resolves.toMatchObject({ success: false });
  expect(root).not.toHaveBeenCalled();
});

it("retains a literal finding in a long line and refuses hard-linked text", async () => {
  const longPath = join(fixture, "generated.ts");
  const marker = "markerNearTheEnd";
  await writeFile(longPath, `${"a".repeat(100_000)} ${marker}\n`);
  await writeFile(join(fixture, ".env"), "sensitiveFixtureValue\n");
  await link(join(fixture, ".env"), join(fixture, "linked.ts"));

  const result = await inspect(new WorkspaceService(fixture), [
    { kind: "read", path: "generated.ts" },
    { kind: "search", path: "generated.ts", query: marker },
    { kind: "read", path: "linked.ts" },
    { kind: "search", path: ".", query: "sensitiveFixtureValue" },
  ]);

  expect(result).toMatchObject({
    success: true,
    data: {
      results: [
        {
          success: true,
          evidence: expect.stringContaining("[Evidence limited.]"),
        },
        { success: true, evidence: expect.stringContaining(marker) },
        { success: false },
        { success: true, evidence: "No literal matches." },
      ],
    },
  });
  expect(result?.text?.length).toBeLessThan(1_300);
  expect(result?.text).not.toContain("linked.ts\nsensitiveFixtureValue");
});

it("rejects a replaced desktop root before starting any read", async () => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  const bound = join(fixture, "project");
  const other = join(fixture, "other");
  await mkdir(bound);
  await mkdir(other);
  const find = vi.fn();
  const workspace = { root: () => bound, search: find };
  await runWithConversationWorkspace(
    { sessionId: "room", botId: "default", workspacePath: bound },
    async () => {
      await rename(bound, join(fixture, "previous-project"));
      await symlink(other, bound);
      await expect(
        inspect(workspace, [search("one"), search("two")], "desktop"),
      ).rejects.toThrow("The inspection workspace changed.");
    },
  );
  expect(find).not.toHaveBeenCalled();
});

it("cancels current reads with the turn and does not schedule the next pair", async () => {
  const controller = new AbortController();
  const find = vi.fn<WorkspaceService["search"]>(
    async (_query, _limit, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error("Search did not receive cancellation");
      signal.throwIfAborted();
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  );
  const running = runWithTurnRuntimeScope(
    runtime,
    { settings: new Map(), abortSignal: controller.signal },
    () =>
      inspect({ root: () => fixture, search: find }, [
        search("first"),
        search("second"),
        search("next"),
      ]),
  );
  const cancelled = expect(running).rejects.toThrow(
    "Inspection cancelled by parent",
  );
  try {
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(2));
  } finally {
    controller.abort(new Error("Inspection cancelled by parent"));
  }
  await cancelled;
  expect(find).toHaveBeenCalledTimes(2);
});
