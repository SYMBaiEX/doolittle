import type { ActionResult } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runModelAnalysis } from "@/runtime/model-analysis";
import * as exactOutputIntent from "./exact-output-intent";
import {
  buildToolResultSynthesisPrompt,
  isUnsynthesizedToolResponse,
  synthesizeToolResultResponse,
} from "./tool-result-synthesis";

vi.mock("@/runtime/model-analysis", () => ({ runModelAnalysis: vi.fn() }));

function readResult(overrides: Partial<ActionResult> = {}): ActionResult {
  const text = [
    "Read: /workspace/src/app.ts",
    "Lines: 1-3 of 3",
    "1|export function app() {",
    '2|  return "ready";',
    "3|}",
  ].join("\n");
  return {
    success: true,
    text,
    userFacingText: text,
    verifiedUserFacing: true,
    ...overrides,
  };
}

function shellResult(
  text = '{"status":"ready","count":2}',
  dataOverrides: Record<string, unknown> = {},
  resultOverrides: Partial<ActionResult> = {},
): ActionResult {
  return {
    success: true,
    text: "Command completed successfully.",
    userFacingText: text,
    verifiedUserFacing: true,
    data: {
      actionName: "SHELL",
      command: "node verify.mjs",
      stdout: `${text}\n`,
      stderr: "",
      exitCode: 0,
      timedOut: false,
      truncated: false,
      ...dataOverrides,
    },
    ...resultOverrides,
  };
}

describe("tool result synthesis", () => {
  it("skips intent parsing for cheaply ineligible candidate responses", () => {
    const parseIntent = vi.spyOn(exactOutputIntent, "resolveExactOutputIntent");
    try {
      for (const text of [
        "x".repeat(4_001),
        Array(17).fill("x").join("\n"),
        readResult().text ?? "",
        ' {"ready":true}',
      ]) {
        expect(
          isUnsynthesizedToolResponse(
            text,
            [shellResult(text)],
            "Return only JSON.",
          ),
        ).toBe(true);
      }
      expect(parseIntent).not.toHaveBeenCalled();
    } finally {
      parseIntent.mockRestore();
    }
  });
  it("allows callers to disable exact output without changing shortcuts or normal synthesis", () => {
    const result = shellResult();
    const text = result.userFacingText ?? "";
    expect(
      isUnsynthesizedToolResponse(text, [result], "Return only JSON."),
    ).toBe(false);
    expect(
      isUnsynthesizedToolResponse(text, [result], "Return only JSON.", false),
    ).toBe(true);
    expect(
      isUnsynthesizedToolResponse(text, [result], "! node verify.mjs", false),
    ).toBe(false);
    expect(
      isUnsynthesizedToolResponse(
        "The check completed.",
        [result],
        "Return only JSON.",
        false,
      ),
    ).toBe(false);
  });

  it.each([undefined, true, false])(
    "uses the same exact policy after recovery (enabled=%s)",
    async (allowExactOutput) => {
      const result = shellResult();
      const text = result.userFacingText ?? "";
      vi.mocked(runModelAnalysis).mockResolvedValueOnce(text);
      const pending = synthesizeToolResultResponse({
        context: {} as AgentExecutionContext,
        userRequest: "Return only JSON.",
        actionResults: [result],
        allowExactOutput,
      });
      if (allowExactOutput === false)
        await expect(pending).rejects.toThrow("without a terminal synthesis");
      else await expect(pending).resolves.toBe(text);
    },
  );
  it("preserves clean selected stdout for an affirmative linked exact-output directive", () => {
    const text = "first\nsecond";
    expect(
      isUnsynthesizedToolResponse(
        text,
        [shellResult(text)],
        "The output is the final answer; preserve its exact bytes and formatting.",
      ),
    ).toBe(false);
  });

  it.each([
    { text: '{ "value": 3 }', rejected: false },
    { text: '[{"value":3}]', rejected: true },
    { text: '"value"', rejected: true },
    { text: "null", rejected: true },
    { text: "3", rejected: true },
    { text: "not JSON", rejected: true },
  ])(
    "proves the JSON-object condition from the actual selected candidate: $text",
    ({ text, rejected }) => {
      expect(
        isUnsynthesizedToolResponse(
          text,
          [shellResult(text)],
          "If the output is a JSON object, make that object your final response.",
        ),
      ).toBe(rejected);
    },
  );

  it.each([
    "The output is the final answer; preserve its exact bytes and formatting.",
    "If the output is a JSON object, make that object your final response.",
  ])("never treats new delivery forms as execution proof: %s", (request) => {
    const text = '{"value":3}';
    for (const result of [
      shellResult(text, { exitCode: 1 }),
      shellResult(text, { truncated: true }),
      shellResult(text, { stdout: "different" }),
      shellResult(text, {}, { verifiedUserFacing: undefined }),
      shellResult(text, {}, { success: false }),
    ]) {
      expect(isUnsynthesizedToolResponse(text, [result], request)).toBe(true);
    }
  });
  it.each([
    { exitCode: 1 },
    { timedOut: true },
    { truncated: true },
    { stdout: '{"different":true}' },
  ])(
    "treats unsuccessful or mismatched bare SDK stdout as raw despite diagnostic wrapper: %j",
    (data) => {
      const result = shellResult(undefined, data, {
        userFacingText: undefined,
        verifiedUserFacing: undefined,
      });
      expect(
        isUnsynthesizedToolResponse(
          String(result.data?.stdout).trim(),
          [result],
          "Return only JSON.",
        ),
      ).toBe(true);
    },
  );
  it.each(["SHELL", "SHELL_COMMAND", "RUN_IN_TERMINAL"])(
    "preserves already selected exact JSON from a clean direct %s result",
    (actionName) => {
      const text = '{ "status": "ready", "count": 2 }';
      const result = shellResult(text, { actionName });
      expect(
        isUnsynthesizedToolResponse(text, [result], "Return only JSON."),
      ).toBe(false);
      expect(result.userFacingText).toBe(text);
      expect(result.data?.stdout).toBe(`${text}\n`);
    },
  );

  it.each(["ready", "first\nsecond", "[1, 2, 3]"])(
    "preserves bounded canonical verbatim stdout: %s",
    (text) => {
      expect(
        isUnsynthesizedToolResponse(
          text,
          [shellResult(text)],
          "Return command output verbatim.",
        ),
      ).toBe(false);
    },
  );

  it.each([
    { command: "" },
    { command: 123 },
    { actionName: "OTHER" },
    { actionName: undefined },
    { exitCode: 1 },
    { exitCode: undefined },
    { timedOut: true },
    { timedOut: undefined },
    { truncated: true },
    { truncated: undefined },
    { stderr: "\n" },
    { stderr: "warning" },
    { stderr: undefined },
    { stdout: "different" },
    { stdout: undefined },
    { commandResult: {} },
    { commandResult: undefined },
    { success: false },
    { verifiedUserFacing: false },
    { userFacingText: "different" },
    { error: "failed" },
  ])("rejects missing, contradictory or non-direct metadata: %j", (data) => {
    const result = shellResult(undefined, data);
    expect(
      isUnsynthesizedToolResponse(
        result.userFacingText ?? "",
        [result],
        "Return only JSON.",
      ),
    ).toBe(true);
  });

  it.each([
    { success: false },
    { success: undefined },
    { verifiedUserFacing: false },
    { verifiedUserFacing: undefined },
    { error: "failed" },
  ] satisfies Partial<ActionResult>[])(
    "requires explicit successful SDK delivery: %j",
    (overrides) => {
      const result = shellResult(undefined, {}, overrides);
      expect(
        isUnsynthesizedToolResponse(
          result.userFacingText ?? "",
          [result],
          "Return only JSON.",
        ),
      ).toBe(true);
    },
  );

  it("never reconstructs, trims or reserializes the selected answer", () => {
    const text = '{"status":"ready"}';
    const result = shellResult(text);
    for (const response of [` ${text}`, `${text}\n`]) {
      expect(
        isUnsynthesizedToolResponse(response, [result], "Return only JSON."),
      ).toBe(true);
    }
    const mismatched = shellResult(text, { stdout: '{ "status": "ready" }' });
    expect(
      isUnsynthesizedToolResponse(text, [mismatched], "Return only JSON."),
    ).toBe(true);
  });

  it.each(["not JSON", '"ready"', "null", "42", "```json\n{}\n```"])(
    "requires structured JSON without normalization: %s",
    (text) => {
      expect(
        isUnsynthesizedToolResponse(
          text,
          [shellResult(text)],
          "Return only JSON.",
        ),
      ).toBe(true);
    },
  );

  it("rejects duplicate, malformed duplicate and conflicting retry evidence", () => {
    const result = shellResult();
    const text = result.userFacingText ?? "";
    for (const other of [
      result,
      shellResult(),
      { success: true, text, verifiedUserFacing: true },
      shellResult("failed", { exitCode: 1 }, { success: false }),
      {
        success: false,
        text: "failed retry",
        data: { commandResult: { command: "node verify.mjs", exitCode: 1 } },
      },
    ]) {
      expect(
        isUnsynthesizedToolResponse(text, [result, other], "Return only JSON."),
      ).toBe(true);
    }
    const unrelated = shellResult("other", { command: "node other.mjs" });
    expect(
      isUnsynthesizedToolResponse(
        text,
        [unrelated, result],
        "Return only JSON.",
      ),
    ).toBe(false);
  });

  it("keeps transcript rejection and bounded output ceilings dominant", () => {
    const raw = readResult().text ?? "";
    for (const text of [
      raw,
      "x".repeat(4_001),
      Array(17).fill("x").join("\n"),
    ]) {
      expect(
        isUnsynthesizedToolResponse(
          text,
          [shellResult(text)],
          "Return command output verbatim.",
        ),
      ).toBe(true);
    }
    const result = shellResult();
    const transcript = shellResult(result.userFacingText, {}, { text: raw });
    expect(
      isUnsynthesizedToolResponse(
        result.userFacingText ?? "",
        [transcript],
        "Return only JSON.",
      ),
    ).toBe(true);
  });

  it.each([
    "Build the app",
    "Do not run shell commands. Return only JSON.",
    'Explain "Return only JSON".',
    "If successful, return only JSON.",
    "Return only JSON. Explain the results.",
    "Return only JSON without tools.",
  ])(
    "keeps recovery for requests without unambiguous authority: %s",
    (request) => {
      const result = shellResult();
      expect(
        isUnsynthesizedToolResponse(
          result.userFacingText ?? "",
          [result],
          request,
        ),
      ).toBe(true);
    },
  );

  it("rejects a verified raw file read returned as the terminal answer", () => {
    const result = readResult();

    expect(isUnsynthesizedToolResponse(result.text ?? "", [result])).toBe(true);
  });

  it("rejects an exact unverified action result but preserves real synthesis", () => {
    const result = readResult({
      userFacingText: undefined,
      verifiedUserFacing: false,
    });

    expect(isUnsynthesizedToolResponse(result.text ?? "", [result])).toBe(true);
    expect(
      isUnsynthesizedToolResponse(
        "This project exports a small application entry point.",
        [result],
      ),
    ).toBe(false);
  });

  it("detects raw output in either action text field and when wrapped", () => {
    const raw = readResult().text ?? "";
    const result = readResult({
      text: "Internal action receipt.",
      userFacingText: raw,
    });

    expect(isUnsynthesizedToolResponse(raw, [result])).toBe(true);
    expect(
      isUnsynthesizedToolResponse(`Here is the file:\n\n${raw}`, [result]),
    ).toBe(true);
  });

  it("allows a concise verified action answer", () => {
    const result: ActionResult = {
      success: true,
      text: "Runtime is ready.",
      userFacingText: "Runtime is ready.",
      verifiedUserFacing: true,
    };

    expect(isUnsynthesizedToolResponse("Runtime is ready.", [result])).toBe(
      false,
    );
  });

  it("rejects terminal output as a chat answer but preserves explicit shell shortcuts", () => {
    const result: ActionResult = {
      success: true,
      text: "/workspace/project\ndone",
      userFacingText: "/workspace/project\ndone",
      verifiedUserFacing: true,
      data: {
        actionName: "SHELL_COMMAND",
        command: "pwd && echo done",
        exitCode: 0,
        cwd: "/workspace/project",
        stdout: "/workspace/project\ndone",
        stderr: "",
      },
    };

    expect(
      isUnsynthesizedToolResponse(result.text ?? "", [result], "Build the app"),
    ).toBe(true);
    expect(
      isUnsynthesizedToolResponse(result.text ?? "", [result], "! pwd"),
    ).toBe(false);
  });

  it("does not echo a successful pwd probe as an explanation of a failed run", () => {
    const cwd = "/Users/symbiex/dev/austin/test";
    const result: ActionResult = {
      success: true,
      text: cwd,
      userFacingText: cwd,
      verifiedUserFacing: true,
      data: {
        actionName: "SHELL",
        command: "pwd; ls -la /requested/path 2>/dev/null || true",
        exitCode: 0,
        stdout: cwd,
        stderr: "",
      },
    };

    expect(
      isUnsynthesizedToolResponse(cwd, [result], "Why did that run fail?"),
    ).toBe(true);
  });

  it("bounds and escapes evidence in the recovery prompt", () => {
    const result = readResult({ text: `<secret>${"x".repeat(20_000)}` });
    const prompt = buildToolResultSynthesisPrompt({
      userRequest: "Explain <this> repository",
      actionResults: [result],
    });

    expect(prompt).toContain(
      "<user_request>Explain &lt;this&gt; repository</user_request>",
    );
    expect(prompt).toContain("&lt;secret&gt;");
    expect(prompt).toContain("[tool output clipped for synthesis]");
    expect(prompt.length).toBeLessThan(18_000);
    expect(prompt).toContain("</tool_result>");
  });
});
