import { describe, expect, it } from "bun:test";

import {
  coerceRelationshipEntityId,
  patchRuntimeRelationshipCompatibility,
} from "./relationship-compat";

describe("coerceRelationshipEntityId", () => {
  it("prefers direct entityId and ignores alternate keys", () => {
    expect(
      coerceRelationshipEntityId({
        entityId: "entity-1",
        sourceEntityId: "source-1",
        targetEntityId: "target-1",
        entityIds: ["entity-2"],
      }),
    ).toBe("entity-1");
  });

  it("falls back to first sourceEntityId when entityId is absent", () => {
    expect(
      coerceRelationshipEntityId({
        sourceEntityId: "source-1",
        targetEntityId: "target-1",
      }),
    ).toBe("source-1");
  });

  it("falls back to entityIds when source/target keys are absent", () => {
    expect(
      coerceRelationshipEntityId({ entityIds: ["", "first", "second"] }),
    ).toBe("first");
  });

  it("returns undefined for unknown payload shapes", () => {
    expect(coerceRelationshipEntityId({ entityIds: [] })).toBeUndefined();
    expect(coerceRelationshipEntityId("hello")).toBeUndefined();
    expect(coerceRelationshipEntityId(undefined)).toBeUndefined();
  });
});

describe("patchRuntimeRelationshipCompatibility", () => {
  it("maps legacy relationship query shapes onto entityId", async () => {
    const calls: unknown[] = [];
    const runtime: {
      getRelationships: (params: unknown) => Promise<unknown[]>;
    } = {
      getRelationships: async (params) => {
        calls.push(params);
        return [];
      },
    };

    patchRuntimeRelationshipCompatibility(runtime as never);

    await runtime.getRelationships({ sourceEntityId: "legacy-1" });
    expect(calls).toEqual([
      { sourceEntityId: "legacy-1", entityId: "legacy-1" },
    ]);
  });

  it("maps legacy entityIds shape onto entityId", async () => {
    const calls: unknown[] = [];
    const runtime: {
      getRelationships: (params: unknown) => Promise<unknown[]>;
    } = {
      getRelationships: async (params) => {
        calls.push(params);
        return [];
      },
    };

    patchRuntimeRelationshipCompatibility(runtime as never);
    await runtime.getRelationships({ entityIds: ["legacy-1"] } as never);

    expect(calls).toEqual([{ entityIds: ["legacy-1"], entityId: "legacy-1" }]);
  });

  it("returns an empty result for empty entityIds without calling original", async () => {
    const runtime: {
      getRelationships: (params: unknown) => Promise<unknown[]>;
    } = {
      getRelationships: async (_params) => {
        throw new Error("should not call original when entityIds is empty");
      },
    };

    patchRuntimeRelationshipCompatibility(runtime as never);
    const result = await runtime.getRelationships({ entityIds: [] } as never);

    expect(result).toEqual([]);
  });
});
