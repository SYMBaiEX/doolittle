import type { ActionResult } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  buildToolResultSynthesisPrompt,
  isUnsynthesizedToolResponse,
} from "./tool-result-synthesis";

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

describe("tool result synthesis", () => {
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
