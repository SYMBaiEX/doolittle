import { type IAgentRuntime, ModelType } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPlannerToolExposurePlugin,
  PLANNER_TOOL_EXPOSURE_FLAG,
  PLANNER_TOOL_EXPOSURE_HOOK_ID,
} from "./planner-tool-exposure";

type Hook = Parameters<IAgentRuntime["registerPipelineHook"]>[0];
const schema = () => ({ type: "object", properties: {}, required: [] });
const tool = (name: string, parameters = schema()) => ({
  name,
  description: "Synthetic tool.",
  type: "function",
  strict: true,
  parameters,
});
const action = (name: string, similes: unknown[] = []) => ({
  name,
  similes,
  description: "Synthetic tool.",
});
afterEach(() => vi.unstubAllEnvs());

async function fixture(actions: unknown[] = [action("FIRST", ["ALIAS"])]) {
  const hooks = new Map<string, Hook>();
  const runtime = {
    actions,
    registerPipelineHook: vi.fn((hook: Hook) => hooks.set(hook.id, hook)),
    unregisterPipelineHook: vi.fn((id: string) => hooks.delete(id)),
  } as unknown as IAgentRuntime;
  const initialize = (enabled?: boolean) =>
    createPlannerToolExposurePlugin({ enabled }).init?.({}, runtime);
  await initialize(true);
  const invoke = async (
    params: unknown,
    model: string = ModelType.ACTION_PLANNER,
  ) => {
    await hooks.get(PLANNER_TOOL_EXPOSURE_HOOK_ID)?.handler(runtime, {
      phase: "pre_model",
      requestedModelType: model,
      resolvedModelKey: model,
      provider: "synthetic",
      params,
    });
  };
  return { runtime, hooks, initialize, invoke };
}

describe("planner alias tool exposure", () => {
  it.each([undefined, "false", "TRUE", "1", " true "])(
    "is inert unless the flag is exactly true (%s) and removes a prior hook",
    async (flag) => {
      vi.stubEnv(PLANNER_TOOL_EXPOSURE_FLAG, flag);
      const f = await fixture();
      await f.initialize();
      expect(f.hooks.size).toBe(0);
      expect(f.runtime.unregisterPipelineHook).toHaveBeenLastCalledWith(
        PLANNER_TOOL_EXPOSURE_HOOK_ID,
      );
    },
  );

  it("supports strict opt-in, injected overrides, stable registration and rollback", async () => {
    vi.stubEnv(PLANNER_TOOL_EXPOSURE_FLAG, "true");
    const f = await fixture();
    await f.initialize();
    await f.initialize(true);
    expect(f.hooks.size).toBe(1);
    expect(f.hooks.get(PLANNER_TOOL_EXPOSURE_HOOK_ID)).toMatchObject({
      phase: "pre_model",
      schedule: "serial",
      position: -90,
      mutatesPrimary: true,
    });
    await f.initialize(false);
    expect(f.hooks.size).toBe(0);
  });

  it("replaces only tools, preserves frozen originals and is idempotent", async () => {
    const f = await fixture();
    const canonical = Object.freeze(tool("FIRST", Object.freeze(schema())));
    const alias = Object.freeze({ ...canonical, name: "ALIAS" });
    const unknown = Object.freeze(tool("UNKNOWN"));
    const terminal = Object.freeze(tool("STOP"));
    const original = Object.freeze([canonical, alias, unknown, terminal]);
    const messages = Object.freeze([{ role: "user", content: "Synthetic." }]);
    const params = {
      tools: original,
      messages,
      toolChoice: "required",
      maxTokens: 7,
    };
    await f.invoke(params);
    expect(params).toEqual({
      tools: [canonical, unknown, terminal],
      messages,
      toolChoice: "required",
      maxTokens: 7,
    });
    expect(original).toEqual([canonical, alias, unknown, terminal]);
    expect(params.tools[0]).toBe(canonical);
    expect(params.tools[0].parameters).toBe(canonical.parameters);
    const filtered = params.tools;
    await f.invoke(params);
    expect(params.tools).toBe(filtered);
  });

  it("allows shared similes with other schemas and refreshes registry per call", async () => {
    const f = await fixture([
      action("FIRST", ["ALIAS"]),
      action("SECOND", ["ALIAS"]),
    ]);
    const canonical = tool("FIRST");
    const second = tool("SECOND");
    const alias = { ...canonical, name: "ALIAS" };
    const params = { tools: [canonical, second, alias] };
    await f.invoke(params);
    expect(params.tools).toEqual([canonical, second]);
    f.runtime.actions.push(action("ALIAS") as IAgentRuntime["actions"][number]);
    const later = { tools: [canonical, second, alias] };
    await f.invoke(later);
    expect(later.tools).toEqual([canonical, second, alias]);
  });

  it("retains a parent-name alias without counting it as a canonical schema owner", async () => {
    const f = await fixture([
      action("FIRST", ["SHARED", "PARENT"]),
      action("PARENT", ["SHARED"]),
    ]);
    const canonical = tool("FIRST");
    const parentAlias = {
      ...canonical,
      name: "PARENT",
      description: "Synthetic tool.\nAlias for FIRST.",
    };
    const shared = { ...canonical, name: "SHARED" };
    const params = { tools: [canonical, parentAlias, shared] };
    await f.invoke(params);
    expect(params.tools).toEqual([canonical, parentAlias]);
    expect(params.tools[1]).toBe(parentAlias);
  });

  it("requires exact canonical registry metadata, including compressed text and routing hint", async () => {
    const registered = {
      ...action("FIRST", ["ALIAS"]),
      descriptionCompressed: "Compressed.",
      routingHint: " Route. ",
    };
    const f = await fixture([registered]);
    const canonical = { ...tool("FIRST"), description: "Route.\nCompressed." };
    const alias = { ...canonical, name: "ALIAS" };
    const good = { tools: [canonical, alias] };
    await f.invoke(good);
    expect(good.tools).toEqual([canonical]);
    const spoofed = {
      ...canonical,
      description: "Unproven canonical metadata.",
    };
    const bad = { tools: [spoofed, alias] };
    const original = bad.tools;
    await f.invoke(bad);
    expect(bad.tools).toBe(original);
  });

  it.each(["name", "description", "descriptionCompressed", "routingHint"])(
    "fails open without invoking registry %s accessors",
    async (key) => {
      const getter = vi.fn(() => {
        throw new Error("No accessor calls.");
      });
      const registered = Object.defineProperty(
        action("FIRST", ["ALIAS"]),
        key,
        { get: getter },
      );
      const f = await fixture([registered]);
      const canonical = tool("FIRST");
      const params = { tools: [canonical, { ...canonical, name: "ALIAS" }] };
      const original = params.tools;
      await f.invoke(params);
      expect(params.tools).toBe(original);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it.each(["description", "routingHint"])(
    "retains tools when registry %s metadata is malformed",
    async (key) => {
      const f = await fixture([{ ...action("FIRST", ["ALIAS"]), [key]: 17 }]);
      const canonical = tool("FIRST");
      const params = { tools: [canonical, { ...canonical, name: "ALIAS" }] };
      const original = params.tools;
      await f.invoke(params);
      expect(params.tools).toBe(original);
    },
  );

  it.each([ModelType.TEXT_LARGE, ModelType.RESPONSE_HANDLER])(
    "leaves %s unchanged",
    async (model) => {
      const f = await fixture();
      const canonical = tool("FIRST");
      const params = { tools: [canonical, { ...canonical, name: "ALIAS" }] };
      const original = params.tools;
      await f.invoke(params, model);
      expect(params.tools).toBe(original);
    },
  );

  it.each([
    "distinct-schema",
    "unknown",
    "missing-canonical",
    "duplicate-alias",
    "duplicate-canonical",
    "multiple-schema-matches",
    "canonical-collision",
    "normalized-collision",
    "normalized-registry-collision",
    "normalized-tool-collision",
    "terminal",
    "nested",
    "extra-key",
    "wrong-type",
    "not-strict",
    "malformed-schema",
  ])("preserves unproven or protected advertisement: %s", async (kind) => {
    const canonical = tool("FIRST");
    let alias: object = { ...canonical, name: "ALIAS" };
    let tools: unknown[] = [canonical, alias];
    const actions = [action("FIRST", ["ALIAS"])];
    if (kind === "distinct-schema") alias = tool("ALIAS");
    if (kind === "unknown") actions[0].similes = [];
    if (kind === "missing-canonical") tools = [alias];
    if (kind === "duplicate-alias") tools.push(alias);
    if (kind === "duplicate-canonical") tools.push(canonical);
    if (kind === "multiple-schema-matches") {
      tools.push({ ...canonical, name: "SECOND" });
      actions.push(action("SECOND", ["ALIAS"]));
    }
    if (kind === "canonical-collision") actions.push(action("ALIAS"));
    if (kind === "normalized-collision") actions.push(action("A_L_I_A_S"));
    if (kind === "normalized-registry-collision")
      actions.push(action("F_I_R_S_T"));
    if (kind === "normalized-tool-collision") tools.push(tool("A_L_I_A_S"));
    if (kind === "terminal") {
      alias = { ...canonical, name: "REPLY" };
      actions[0].similes = ["REPLY"];
    }
    if (kind === "nested")
      alias = { type: "function", function: { ...canonical, name: "ALIAS" } };
    if (kind === "extra-key") alias = { ...alias, custom: true };
    if (kind === "wrong-type") alias = { ...alias, type: "other" };
    if (kind === "not-strict") alias = { ...alias, strict: false };
    if (kind === "malformed-schema") alias = { ...alias, parameters: [] };
    if (!new Set(["missing-canonical", "duplicate-alias"]).has(kind))
      tools[1] = alias;
    const original = tools;
    const f = await fixture(actions);
    const params = { tools };
    await f.invoke(params);
    expect(params.tools).toBe(original);
  });

  it("never invokes accessors on tools, actions, similes or params", async () => {
    const getter = vi.fn(() => {
      throw new Error("Must not read accessor.");
    });
    const canonical = tool("FIRST");
    const alias = { ...canonical, name: "ALIAS" };
    const accessorAlias = Object.defineProperty({ ...alias }, "name", {
      get: getter,
    });
    const accessorAction = Object.defineProperty(action("FIRST"), "similes", {
      get: getter,
    });
    const similes = Object.defineProperty(["ALIAS"], "0", { get: getter });
    for (const actions of [[accessorAction], [action("FIRST", similes)]]) {
      const f = await fixture(actions);
      const params = { tools: [canonical, alias, accessorAlias] };
      const original = params.tools;
      await f.invoke(params);
      expect(params.tools).toBe(original);
      await f.invoke(Object.defineProperty({}, "tools", { get: getter }));
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("retains the entire payload when an unreadable tool name could hide a duplicate", async () => {
    const f = await fixture();
    const getter = vi.fn(() => "ALIAS");
    const canonical = tool("FIRST");
    const unreadable = Object.defineProperty({}, "name", { get: getter });
    const params = {
      tools: [canonical, { ...canonical, name: "ALIAS" }, unreadable],
    };
    const original = params.tools;
    await f.invoke(params);
    expect(params.tools).toBe(original);
    expect(getter).not.toHaveBeenCalled();
  });

  it("fails open for frozen params, sparse arrays, nonplain params and assignment errors", async () => {
    const f = await fixture();
    const canonical = tool("FIRST");
    const tools = [canonical, { ...canonical, name: "ALIAS" }];
    const frozen = Object.freeze({ tools });
    await expect(f.invoke(frozen)).resolves.toBeUndefined();
    const sparseTools: unknown[] = Array(3);
    sparseTools[0] = canonical;
    sparseTools[2] = tools[1];
    const sparse = { tools: sparseTools };
    await f.invoke(sparse);
    expect(sparse.tools).toHaveLength(3);
    const nonplain = Object.assign(Object.create({ marker: true }), { tools });
    await f.invoke(nonplain);
    expect(nonplain.tools).toBe(tools);
    const target = { tools };
    const proxy = new Proxy(target, {
      set: () => {
        throw new Error("Assignment denied.");
      },
    });
    await expect(f.invoke(proxy)).resolves.toBeUndefined();
    expect(target.tools).toBe(tools);
    expect(frozen.tools).toBe(tools);
  });
});
