import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { requirePostToolAssessment } from "./planner-completion";

const preamble =
  "I’ve confirmed the selected workspace and package metadata. I’m reading the README plus two representative source files now, staying strictly read-only.";

describe("native planner post-tool completion", () => {
  it.each([undefined, true])(
    "defers pre-execution completion=%s until tool results are assessed",
    (completed) => {
      const plan = {
        thought: "Read required files",
        toolCalls: [{ name: "READ_FILE", args: { path: "README.md" } }],
        messageToUser: preamble,
        ...(completed === undefined ? {} : { completed }),
      };
      expect(
        JSON.parse(requirePostToolAssessment(JSON.stringify(plan))),
      ).toEqual({ ...plan, completed: false });
    },
  );

  it.each(["REPLY", "IGNORE", "STOP", "NONE"])(
    "preserves terminal-only %s without rewriting it",
    (name) => {
      const raw = JSON.stringify({
        toolCalls: [{ name, args: { text: "All requested files inspected." } }],
        completed: true,
      });
      expect(requirePostToolAssessment(raw)).toBe(raw);
    },
  );

  it("handles mixed terminal/tool plans and native function-call JSON without altering parameters", () => {
    const plan = {
      toolCalls: [
        { name: "REPLY", args: { text: "Checking" } },
        {
          id: "read",
          type: "function",
          function: {
            name: "functions.READ_FILE",
            arguments: '{"path":"src/page.tsx"}',
          },
        },
      ],
      usage: { promptTokens: 40 },
      completed: true,
    };
    expect(JSON.parse(requirePostToolAssessment(JSON.stringify(plan)))).toEqual(
      { ...plan, completed: false },
    );
  });

  it("preserves native structured output objects, including model usage and provider metadata", () => {
    const raw = {
      text: "Checking source",
      toolCalls: [{ name: "READ_FILE", arguments: { path: "README.md" } }],
      usage: { promptTokens: 100, completionTokens: 12 },
      providerMetadata: { requestId: "provider-id" },
    };
    expect(requirePostToolAssessment(raw)).toBe(raw);
  });

  it("leaves explicit continuation, final prose, and invalid output untouched", () => {
    for (const raw of [
      "Final answer",
      "{invalid",
      JSON.stringify({ toolCalls: [], completed: true, messageToUser: "Done" }),
      JSON.stringify({ toolCalls: [{ name: "READ_FILE" }], completed: false }),
    ]) {
      expect(requirePostToolAssessment(raw)).toBe(raw);
    }
  });

  it("prevents the installed beta.7 gated FINISH after the exact live preamble", () => {
    // The package publishes the planner .d.ts but no importable runtime JS
    // subpath/export. Evaluate the installed gate itself, not a copied model,
    // so a changed SDK boundary fails this regression visibly. The unsafe-text
    // helper is irrelevant to this known safe fixture; no provider is invoked.
    const source = readFileSync(
      createRequire(import.meta.url).resolve("@elizaos/core"),
      "utf8",
    );
    const start = source.indexOf("function tryGateEvaluator(args) {");
    const end = source.indexOf("\nvar GATED_EVALUATOR_THOUGHT", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const gate = runInNewContext(
      `${source.slice(start, end)}; tryGateEvaluator`,
      {
        isUnsafeUserVisibleText: () => false,
        GATED_EVALUATOR_THOUGHT: "installed gate",
      },
    ) as (args: unknown) => { decision: string } | null;
    const args = {
      trajectory: { steps: [{ result: { success: true } }], plannedQueue: [] },
      failures: [],
      lastPlannerExplicitMessageToUser: preamble,
      lastPlannerExplicitCompleted: undefined,
    };
    expect(gate(args)?.decision).toBe("FINISH");
    const guarded = JSON.parse(
      requirePostToolAssessment(
        JSON.stringify({
          toolCalls: [{ name: "READ_FILE", args: { path: "package.json" } }],
          messageToUser: preamble,
        }),
      ),
    );
    expect(
      gate({ ...args, lastPlannerExplicitCompleted: guarded.completed }),
    ).toBeNull();
  });
});
