import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEvalModelInputObservationsPlugin,
  createModelInputObservationSink,
  MODEL_INPUT_OBSERVATION_FILE,
  MODEL_INPUT_OBSERVATION_FLAG,
  observeEvalModelInputUsage,
  projectModelInput,
} from "./eval-model-input-observations";
import type { CodexModelCallMetric } from "./eval-model-metrics";

type Hook = Parameters<IAgentRuntime["registerPipelineHook"]>[0];
const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function directory() {
  const path = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-input-observation-")),
  );
  directories.push(path);
  return path;
}
const metric: CodexModelCallMetric = {
  provider: "codex",
  completed: true,
  providerDurationMs: 12,
  firstTextMs: 1,
  inputTokens: 150_000,
  outputTokens: 2,
  totalTokens: 150_002,
};
async function fixture(sink?: (row: object) => void) {
  const rows: object[] = [];
  const hooks = new Map<string, Hook>();
  const runtime = {
    unregisterPipelineHook: vi.fn(),
    registerPipelineHook: (hook: Hook) => hooks.set(hook.phase, hook),
  } as unknown as IAgentRuntime;
  await createEvalModelInputObservationsPlugin({
    enabled: true,
    sink: sink ?? ((row) => rows.push(row)),
  }).init?.({}, runtime);
  const invoke = async (phase: "pre_model" | "post_model", params: unknown) => {
    const hook = hooks.get(phase);
    await hook?.handler(runtime, {
      phase,
      params,
      provider: "codex-cli",
      requestedModelType: "RESPONSE_HANDLER",
      resolvedModelKey: "TEXT_LARGE",
      streaming: true,
      ...(phase === "post_model"
        ? { durationMs: 10, result: { current: "private result" } }
        : {}),
    } as Parameters<Hook["handler"]>[1]);
  };
  return { rows, hooks, runtime, invoke };
}

describe("optional resolved model input projection", () => {
  it("counts own strings, supported image parts and schema characters without mutation", () => {
    const schema = {
      type: "object",
      properties: { value: { type: "string" } },
    };
    const params = Object.freeze({
      system: "sys",
      prompt: "prompt",
      stream: true,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "text" },
            { type: "image", image: new Uint8Array([1, 2]) },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: { name: "private name", parameters: schema },
        },
      ],
    });
    expect(projectModelInput(params)).toEqual({
      systemChars: 3,
      promptChars: 6,
      messageTextChars: 4,
      messageCount: 1,
      imageCount: 1,
      toolCount: 1,
      toolSchemaChars: JSON.stringify(schema).length,
      requestedStreaming: true,
      partial: false,
    });
    expect(params.tools[0]?.function.parameters).toBe(schema);
  });

  it("does not read getters, inherited content, image data, or toJSON", () => {
    const getter = vi.fn(() => {
      throw new Error("PRIVATE_CANARY");
    });
    const params = Object.create({ prompt: "PRIVATE_CANARY" });
    Object.defineProperty(params, "system", { get: getter });
    const schema = { type: "object", toJSON: getter };
    params.tools = [{ parameters: schema }];
    params.messages = [
      {
        content: [
          {
            type: "image",
            get image() {
              return getter();
            },
          },
        ],
      },
    ];
    const projected = projectModelInput(params);
    expect(getter).not.toHaveBeenCalled();
    expect(projected).toMatchObject({
      systemChars: null,
      promptChars: null,
      toolSchemaChars: null,
      imageCount: 1,
      partial: true,
    });
    expect(JSON.stringify(projected)).not.toContain("PRIVATE_CANARY");
  });

  it("rejects non-enumerable own toJSON without calling its getter or function", () => {
    const canary = vi.fn(() => {
      throw new Error("PRIVATE_CANARY");
    });
    for (const descriptor of [{ value: canary }, { get: canary }]) {
      const schema = { type: "object" };
      Object.defineProperty(schema, "toJSON", {
        ...descriptor,
        enumerable: false,
      });
      const projected = projectModelInput({ tools: [{ parameters: schema }] });
      expect(projected).toMatchObject({
        toolSchemaChars: null,
        partial: true,
      });
      expect(JSON.stringify(projected)).not.toContain("PRIVATE_CANARY");
    }
    expect(canary).not.toHaveBeenCalled();
  });

  it("fails open on proxy traps, cycles, excessive arrays and schema scan/depth caps", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const schema of [cyclic, { description: "x".repeat(65_537) }]) {
      expect(
        projectModelInput({ tools: [{ parameters: schema }] }),
      ).toMatchObject({ toolSchemaChars: null, partial: true });
    }
    expect(
      projectModelInput({
        messages: Array.from({ length: 65 }, () => ({ content: "x" })),
      }),
    ).toMatchObject({
      messageCount: null,
      messageTextChars: null,
      partial: true,
    });
    let deep: object = {};
    for (let index = 0; index < 10; index++) deep = { deep };
    expect(
      projectModelInput({ tools: [{ parameters: deep }] }).toolSchemaChars,
    ).toBeNull();
    expect(
      projectModelInput(
        new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              throw new Error("PRIVATE_CANARY");
            },
          },
        ),
      ),
    ).toMatchObject({ partial: true });
  });

  it("is default-off and registers only public serial observation hooks when enabled", async () => {
    vi.stubEnv(MODEL_INPUT_OBSERVATION_FLAG, "false");
    const registerPipelineHook = vi.fn();
    const runtime = { registerPipelineHook } as unknown as IAgentRuntime;
    await createEvalModelInputObservationsPlugin().init?.({}, runtime);
    observeEvalModelInputUsage(runtime, {}, metric);
    expect(registerPipelineHook).not.toHaveBeenCalled();
    const { hooks } = await fixture();
    expect([...hooks.values()]).toHaveLength(2);
    for (const hook of hooks.values())
      expect(hook).toMatchObject({
        schedule: "serial",
        position: 100,
        mutatesPrimary: false,
      });
  });

  it("links usage by runtime and exact params identity, never slot/time/order or text", async () => {
    const f = await fixture();
    const params = { prompt: "PRIVATE_CANARY", stream: true };
    await f.invoke("pre_model", params);
    observeEvalModelInputUsage(f.runtime, params, metric);
    await f.invoke("post_model", params);
    expect(f.rows[0]).toMatchObject({
      phase: "unknown",
      slot: "TEXT_LARGE",
      requestedSlot: "RESPONSE_HANDLER",
      promptChars: 14,
      projectionMs: expect.any(Number),
      priorSinkMs: 0,
    });
    expect(f.rows[1]).toMatchObject({
      kind: "provider-usage",
      ordinal: 1,
      association: "same-params-object",
      inputTokens: 150_000,
    });
    expect(f.rows[2]).toMatchObject({
      kind: "settlement",
      ordinal: 1,
      consumedStreaming: true,
    });
    observeEvalModelInputUsage(f.runtime, { ...params }, metric);
    expect(f.rows.at(-1)).toMatchObject({
      ordinal: null,
      association: "unavailable",
    });
    const other = await fixture();
    observeEvalModelInputUsage(other.runtime, params, metric);
    expect(other.rows[0]).toMatchObject({
      ordinal: null,
      association: "unavailable",
    });
    expect(JSON.stringify(f.rows)).not.toContain("PRIVATE_CANARY");
    expect(JSON.stringify(f.rows)).not.toContain("private result");
  });

  it("rejects reused/concurrent parameter identity and duplicate/late usage", async () => {
    const f = await fixture();
    const params = { prompt: "x" };
    await f.invoke("pre_model", params);
    await f.invoke("pre_model", params);
    observeEvalModelInputUsage(f.runtime, params, metric);
    expect(f.rows.at(-1)).toMatchObject({
      ordinal: null,
      association: "unavailable",
    });
    const unique = { prompt: "y" };
    await f.invoke("pre_model", unique);
    observeEvalModelInputUsage(f.runtime, unique, metric);
    observeEvalModelInputUsage(f.runtime, unique, metric);
    expect(f.rows.at(-1)).toMatchObject({ ordinal: null });
    const late = {};
    await f.invoke("pre_model", late);
    await f.invoke("post_model", late);
    observeEvalModelInputUsage(f.runtime, late, metric);
    expect(f.rows.at(-1)).toMatchObject({ ordinal: null });
  });

  it("associates distinct concurrent calls in reverse completion order", async () => {
    const f = await fixture();
    const first = {};
    const second = {};
    await f.invoke("pre_model", first);
    await f.invoke("pre_model", second);
    observeEvalModelInputUsage(f.runtime, second, metric);
    observeEvalModelInputUsage(f.runtime, first, metric);
    expect(f.rows.slice(-2)).toMatchObject([{ ordinal: 2 }, { ordinal: 1 }]);
  });

  it("keeps failure/cancellation observations and caps rows without affecting callbacks", async () => {
    const f = await fixture();
    const params = { stream: false };
    await f.invoke("pre_model", params);
    observeEvalModelInputUsage(f.runtime, params, {
      ...metric,
      completed: false,
      inputTokens: null,
    });
    expect(f.rows.at(-1)).toMatchObject({
      completed: false,
      inputTokens: null,
      ordinal: 1,
    });
    for (let index = 0; index < 600; index++) await f.invoke("pre_model", {});
    expect(f.rows).toHaveLength(512);
    const broken = await fixture(() => {
      throw new Error("PRIVATE_CANARY");
    });
    await expect(broken.invoke("pre_model", {})).resolves.toBeUndefined();
    expect(() =>
      observeEvalModelInputUsage(broken.runtime, {}, metric),
    ).not.toThrow();
  });
});

describe("private observation sidecar sink", () => {
  it("never adopts another sink/process file or an ordinary file replacement", () => {
    const root = directory();
    const sink = createModelInputObservationSink(root);
    sink({ phase: "unknown" });
    const path = join(root, MODEL_INPUT_OBSERVATION_FILE);
    const original = readFileSync(path, "utf8");
    createModelInputObservationSink(root)({ phase: "unknown" });
    expect(readFileSync(path, "utf8")).toBe(original);
    renameSync(path, join(root, "retained"));
    writeFileSync(path, "unchanged", { mode: 0o600 });
    sink({ phase: "unknown" });
    expect(readFileSync(path, "utf8")).toBe("unchanged");
  });
  it("exclusively creates a 0600 regular file then appends verified rows", () => {
    const root = directory();
    const sink = createModelInputObservationSink(root);
    sink({ version: 1, phase: "unknown" });
    sink({ version: 1, phase: "unknown" });
    const path = join(root, MODEL_INPUT_OBSERVATION_FILE);
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(2);
    expect(lstatSync(path).mode & 0o777).toBe(0o600);
  });

  it("retains symlink targets, shared roots, unsafe existing modes and substituted directories", () => {
    const root = directory();
    const foreign = join(root, "foreign");
    writeFileSync(foreign, "PRIVATE_CANARY");
    const path = join(root, MODEL_INPUT_OBSERVATION_FILE);
    symlinkSync(foreign, path);
    createModelInputObservationSink(root)({ phase: "unknown" });
    expect(readFileSync(foreign, "utf8")).toBe("PRIVATE_CANARY");
    rmSync(path);
    writeFileSync(path, "unchanged", { mode: 0o644 });
    createModelInputObservationSink(root)({ phase: "unknown" });
    expect(readFileSync(path, "utf8")).toBe("unchanged");
    expect(lstatSync(path).mode & 0o777).toBe(0o644);
    chmodSync(root, 0o755);
    createModelInputObservationSink(root)({ phase: "unknown" });
    expect(lstatSync(root).mode & 0o777).toBe(0o755);
    const owned = directory();
    const sink = createModelInputObservationSink(owned);
    sink({ phase: "unknown" });
    const replacement = directory();
    const retained = `${owned}-retained`;
    renameSync(owned, retained);
    directories.push(retained);
    renameSync(replacement, owned);
    writeFileSync(join(owned, "sentinel"), "unchanged");
    sink({ phase: "unknown" });
    expect(readFileSync(join(owned, "sentinel"), "utf8")).toBe("unchanged");
    expect(() =>
      lstatSync(join(owned, MODEL_INPUT_OBSERVATION_FILE)),
    ).toThrow();
  });

  it("pins the directory before the first row and refuses redirected roots", () => {
    const owned = directory();
    const sink = createModelInputObservationSink(owned);
    const replacement = directory();
    const retained = `${owned}-retained`;
    renameSync(owned, retained);
    directories.push(retained);
    renameSync(replacement, owned);
    sink({ phase: "unknown" });
    expect(() =>
      lstatSync(join(owned, MODEL_INPUT_OBSERVATION_FILE)),
    ).toThrow();
    const alias = `${owned}-alias`;
    symlinkSync(owned, alias);
    directories.push(alias);
    createModelInputObservationSink(alias)({ phase: "unknown" });
    expect(() =>
      lstatSync(join(owned, MODEL_INPUT_OBSERVATION_FILE)),
    ).toThrow();
  });
});
