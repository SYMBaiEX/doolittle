import type { ActionResult } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  getScopedTurnActionResults,
  hasScopedTurnActionReceipts,
  recordScopedTurnActionResult,
  resolveScopedTurnActionResult,
  runWithAdditionalTurnRuntimeSettings,
  runWithTurnRuntimeScope,
} from "./turn-runtime-scope";

function receipt(): ActionResult {
  return {
    success: true,
    text: "Observation",
    data: {
      actionName: "DOOLITTLE_BROWSER_ANALYZE",
      reviewAttempted: true,
      modelEvidence: "rendered-pixels",
    },
  };
}

describe("request-local action occurrence provenance", () => {
  it("resolves shallow and JSON projections to the full original without new settlement", () => {
    const runtime = { getSetting: (_key: string): unknown => undefined };
    runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      () => {
        const original = receipt();
        recordScopedTurnActionResult(runtime, original);
        const json = JSON.parse(JSON.stringify(original)) as ActionResult;
        if (json.data) delete json.data.modelEvidence;
        expect(
          resolveScopedTurnActionResult(runtime, {
            ...original,
            data: { ...original.data },
          }),
        ).toBe(original);
        expect(resolveScopedTurnActionResult(runtime, json)).toBe(original);
        if (json.data) delete json.data.actionName;
        expect(resolveScopedTurnActionResult(runtime, json)).toBe(original);
        recordScopedTurnActionResult(runtime, original);
        expect(getScopedTurnActionResults(runtime)).toEqual([original]);
        expect(
          resolveScopedTurnActionResult(runtime, {
            ...original,
            data: {
              actionName: "DOOLITTLE_BROWSER_ANALYZE",
              doolittleTurnReceiptId: "not-a-settled-occurrence",
            },
          }),
        ).toBeUndefined();
      },
    );
  });
  it.each(["WRITE_FILE", "DOOLITTLE_APP_SERVER"])(
    "does not resolve a known occurrence ID with contradictory %s identity",
    (actionName) => {
      const runtime = { getSetting: (_key: string): unknown => undefined };
      runWithTurnRuntimeScope(
        runtime,
        { settings: new Map(), settledActionResults: [] },
        () => {
          const original = receipt();
          recordScopedTurnActionResult(runtime, original);
          const projection = structuredClone(original);
          projection.data = { ...projection.data, actionName };
          expect(
            resolveScopedTurnActionResult(runtime, projection),
          ).toBeUndefined();
          expect(getScopedTurnActionResults(runtime)).toEqual([original]);
          expect(projection.data.doolittleTurnReceiptId).toBe(
            original.data?.doolittleTurnReceiptId,
          );
        },
      );
    },
  );
  it("distinguishes actually settled observations with identical payloads", () => {
    const runtime = { getSetting: (_key: string): unknown => undefined };
    runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      () => {
        const first = receipt();
        const second = structuredClone(first);
        recordScopedTurnActionResult(runtime, first);
        recordScopedTurnActionResult(runtime, second);
        expect(first.data?.doolittleTurnReceiptId).not.toBe(
          second.data?.doolittleTurnReceiptId,
        );
        expect(getScopedTurnActionResults(runtime)).toEqual([first, second]);
      },
    );
  });
  it.each(["frozen-result", "frozen-data", "non-extensible-result"])(
    "preserves completed originals with %s without mutating nested data",
    (kind) => {
      const runtime = { getSetting: (_key: string): unknown => undefined };
      runWithTurnRuntimeScope(
        runtime,
        { settings: new Map(), settledActionResults: [] },
        () => {
          const original = receipt();
          const data = original.data;
          if (kind === "frozen-result") Object.freeze(original);
          if (kind === "frozen-data") Object.freeze(data);
          if (kind === "non-extensible-result")
            Object.preventExtensions(original);
          expect(() =>
            recordScopedTurnActionResult(runtime, original),
          ).not.toThrow();
          expect(data).not.toHaveProperty("doolittleTurnReceiptId");
          expect(getScopedTurnActionResults(runtime)).toEqual([original]);
          expect(resolveScopedTurnActionResult(runtime, original)).toBe(
            original,
          );
          if (kind === "frozen-result")
            expect(
              resolveScopedTurnActionResult(runtime, structuredClone(original)),
            ).toBeUndefined();
        },
      );
    },
  );
  it("shares occurrence authority through nested adapter settings", () => {
    const runtime = { getSetting: (_key: string): unknown => undefined };
    const other = { getSetting: () => undefined };
    runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      () => {
        const original = receipt();
        recordScopedTurnActionResult(runtime, original);
        runWithAdditionalTurnRuntimeSettings(
          runtime,
          new Map([["adapter", "configured"]]),
          () => {
            expect(runtime.getSetting("adapter")).toBe("configured");
            expect(
              resolveScopedTurnActionResult(runtime, structuredClone(original)),
            ).toBe(original);
            expect(
              resolveScopedTurnActionResult(other, original),
            ).toBeUndefined();
            recordScopedTurnActionResult(runtime, receipt());
          },
        );
        expect(getScopedTurnActionResults(runtime)).toHaveLength(2);
      },
    );
    expect(hasScopedTurnActionReceipts(runtime)).toBe(false);
  });
  it("isolates concurrent turns on one shared runtime without using content as identity", async () => {
    const runtime = { getSetting: (_key: string): unknown => undefined };
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = receipt();
    const second = receipt();
    const a = runWithTurnRuntimeScope(
      runtime,
      { settings: new Map([["turn", "first"]]), settledActionResults: [] },
      async () => {
        recordScopedTurnActionResult(runtime, first);
        await barrier;
        expect(runtime.getSetting("turn")).toBe("first");
        expect(
          resolveScopedTurnActionResult(runtime, structuredClone(second)),
        ).toBeUndefined();
        expect(getScopedTurnActionResults(runtime)).toEqual([first]);
      },
    );
    const b = runWithTurnRuntimeScope(
      runtime,
      { settings: new Map([["turn", "second"]]), settledActionResults: [] },
      async () => {
        recordScopedTurnActionResult(runtime, second);
        expect(
          resolveScopedTurnActionResult(runtime, structuredClone(first)),
        ).toBeUndefined();
        expect(getScopedTurnActionResults(runtime)).toEqual([second]);
        release();
      },
    );
    await Promise.all([a, b]);
  });
  it("does not mint or resolve provenance outside an active receipt scope", () => {
    const runtime = { getSetting: () => undefined };
    const original = receipt();
    recordScopedTurnActionResult(runtime, original);
    expect(original.data).not.toHaveProperty("doolittleTurnReceiptId");
    expect(resolveScopedTurnActionResult(runtime, original)).toBeUndefined();
  });
});
