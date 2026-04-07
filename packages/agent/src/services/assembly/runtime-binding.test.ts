import { describe, expect, it } from "bun:test";
import type { IAgentRuntime } from "@elizaos/core";
import { createRuntimeBinder } from "./runtime-binding";

describe("createRuntimeBinder", () => {
  it("rebases dependent services when runtime changes", () => {
    const calls: string[] = [];
    let boundRuntimeId: string | undefined;
    const documents = {
      current: { tag: "documents" },
      peek() {
        return this.current;
      },
      set(value: unknown) {
        this.current = value as { tag: string };
        calls.push(`documents:${this.current.tag}`);
      },
    };
    const diagnostics = {
      attachRuntime(runtime: { id: string }) {
        calls.push(`diagnostics:${runtime.id}`);
      },
    };
    const operator = {
      attachRuntime(runtime: { id: string }) {
        calls.push(`operator:${runtime.id}`);
      },
    };

    const bindRuntime = createRuntimeBinder({
      executionApprovals: {
        bindRuntime(runtime: IAgentRuntime) {
          calls.push(`approvals:${(runtime as unknown as { id: string }).id}`);
        },
      },
      documents: documents as never,
      diagnostics: {
        peek() {
          return diagnostics;
        },
      } as never,
      operator: {
        peek() {
          return operator;
        },
      } as never,
      createDocumentsService(runtime: IAgentRuntime) {
        const id = (runtime as unknown as { id: string }).id;
        calls.push(`factory:${id}`);
        return { tag: `documents:${id}` } as never;
      },
      setBoundRuntime(runtime: IAgentRuntime) {
        boundRuntimeId = (runtime as unknown as { id: string }).id;
        calls.push(`bound:${boundRuntimeId}`);
      },
    });

    bindRuntime({ id: "runtime-1" } as unknown as never);

    expect(calls).toEqual([
      "bound:runtime-1",
      "approvals:runtime-1",
      "factory:runtime-1",
      "documents:documents:runtime-1",
      "diagnostics:runtime-1",
      "operator:runtime-1",
    ]);
    expect(boundRuntimeId).toBe("runtime-1");
    expect(documents.current).toEqual({ tag: "documents:runtime-1" });
  });
});
