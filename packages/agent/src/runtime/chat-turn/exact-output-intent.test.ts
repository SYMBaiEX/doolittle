import { describe, expect, it } from "vitest";
import { HEADLESS_EVAL_SUITES } from "../../../../evals/src/headless/cases";
import { resolveExactOutputIntent } from "./exact-output-intent";

describe("original user exact output intent", () => {
  it.each(["[", "{", "[{"])(
    "fails closed on aggregate masking exhaustion before a valid trailing directive: %s",
    (opener) => {
      const request = `Context: ${opener.repeat(500)}${"x".repeat(30_000)}. Return only JSON.`;
      expect(request.length).toBeLessThan(32_000);
      expect(resolveExactOutputIntent(request)).toBeUndefined();
      expect(
        resolveExactOutputIntent("Context: ordinary data. Return only JSON."),
      ).toBe("json");
    },
  );

  it("retains valid multiple small structured bodies under the shared budget", () => {
    const context = Array.from({ length: 100 }, (_, index) =>
      JSON.stringify({ example: index, nested: [1, 2] }),
    ).join(" ");
    expect(
      resolveExactOutputIntent(
        `Context: ${context}. If the check succeeds, return exactly {"state":"ready"}. Otherwise return exactly {"state":"unknown"}.`,
      ),
    ).toBe("json");
  });
  it.each([
    "Return only JSON.",
    'Run the check. Return only the exact JSON {"status":"ready"}.',
    "Please respond exactly with JSON.",
    "Output exact JSON array.",
    "Run this exact command: `node check.mjs`. Return only its JSON output byte-for-byte; do not add prose or Markdown.",
    "The final response must be exactly its JSON body with no code fence or added text.",
    'On verifier success, the final response must be exactly its success JSON body with no code fence or added text: {"status":"ok"}. Otherwise return exactly {"status":"unknown"} with no other text. Do not claim verification from another command.',
    'If the check succeeds, return only JSON. If the check fails, return exactly {"state":"not-checked"}.',
    "When the command succeeds, respond exactly with JSON. Otherwise return only JSON.",
    "Run the check. Do not edit unrelated files. Return only JSON; do not add Markdown.",
  ])("recognizes a direct structured directive: %s", (request) => {
    expect(resolveExactOutputIntent(request)).toBe("json");
  });

  it("recognizes the public original-verifier task's actual delivery contract", () => {
    const task = HEADLESS_EVAL_SUITES["headless-workflows-v7"]?.tasks.find(
      (entry) => entry.groundingStrategy === "coding-original-verifier-v1",
    );
    expect(task).toBeDefined();
    expect(resolveExactOutputIntent(task?.prompt ?? "")).toBe("json");
  });

  it.each([
    "Return the command stdout verbatim.",
    "Print only command output exactly.",
    "Reply verbatim stdout.",
    "The output is the final answer; preserve its exact bytes and formatting.",
    "The command stdout is the final response. Please preserve its exact bytes and formatting.",
  ])("recognizes a direct stdout directive: %s", (request) => {
    expect(resolveExactOutputIntent(request)).toBe("verbatim");
  });

  it.each([
    "If the output is a JSON object, make that object your final response.",
    "If the command stdout is a JSON object, then make that object your final answer.",
  ])(
    "recognizes only the decidable JSON-object shape condition: %s",
    (request) => {
      expect(resolveExactOutputIntent(request)).toBe("json-object");
    },
  );

  it.each([
    "Build the app",
    "Return JSON.",
    "Return exactly JSON_VALUE.",
    "Return exactly \uE000.",
    'Explain the phrase "Return only JSON".',
    "`Return only JSON`",
    "```\nReturn only JSON\n```",
    "> Return only JSON",
    "'Return only JSON'",
    "“Return only JSON”",
    "Do not return only JSON.",
    "Don't run commands. Return only JSON.",
    "Run no shell commands. Return only JSON.",
    "Return only JSON without tools.",
    "Return only JSON without executing shell commands.",
    "Return only JSON without invoking a terminal.",
    "No terminal. Return only JSON.",
    "Skip running commands. Return only JSON.",
    "Never use tools. Return only JSON.",
    "If the check succeeds, return only JSON.",
    "Return only JSON when ready.",
    "Return only JSON unless something fails.",
    "Return only JSON. Otherwise explain the failure.",
    "Return only JSON or YAML.",
    "Return only JSON and include a summary.",
    "Return only JSON. Explain the results.",
    "Return only JSON. Give a brief explanation.",
    "If the check succeeds, return only JSON. Otherwise explain the failure.",
    "If the check succeeds, return only JSON. If the test fails, return only JSON.",
    "If the check succeeds, return only JSON. If the check succeeds, return only JSON.",
    "Otherwise return only JSON.",
    "If the weather is good, return only JSON. Otherwise return only JSON.",
    "If the check succeeds, return only JSON. Otherwise return command output verbatim.",
    "On success, return only JSON. Otherwise return only JSON.",
    "The final response must not be exactly JSON.",
    "Return only JSON. The final response must not be JSON.",
    "Return only JSON. No JSON.",
    "Return only JSON. Do not add JSON.",
    "Return only JSON. Do not return JSON.",
    "If the command succeeds, return only JSON. Otherwise return only JSON. Otherwise return only JSON.",
    "Return only JSON. Return command output verbatim.",
    "Discuss whether to return only JSON.",
    "Return exactly the quoted words.",
    "Return the log verbatim.",
    "The output is the final answer.",
    "Preserve its exact bytes and formatting.",
    "The output is the final answer; preserve their exact bytes and formatting.",
    "The output is the final answer; preserve its exact bytes.",
    "The output is not the final answer; preserve its exact bytes and formatting.",
    '"The output is the final answer; preserve its exact bytes and formatting."',
    'The output is the final answer; "preserve its exact bytes and formatting".',
    "The output is the final answer; explain the result; preserve its exact bytes and formatting.",
    "The output is the final answer; preserve its exact bytes and formatting. Return only JSON.",
    "Do not run shell commands. The output is the final answer; preserve its exact bytes and formatting.",
    "You mustn't run commands. The output is the final answer; preserve its exact bytes and formatting.",
    "Do not launch a terminal. If the output is a JSON object, make that object your final response.",
    "The output is the final answer; do not preserve its exact bytes and formatting.",
    '"If the output is a JSON object, make that object your final response."',
    "If the output is not a JSON object, make that object your final response.",
    "If the output is a JSON object, make that object your final response. Explain it.",
    "If the output is a JSON object, make that object your final response. Return only JSON.",
    "If the output is a JSON array, make that array your final response.",
    "If the output is a JSON object, make a summary your final response.",
    "Do not run commands. If the output is a JSON object, make that object your final response.",
    "If the output is a JSON object, make that object your final response. Otherwise return only JSON.",
  ])("fails closed for unsupported or conflicting requests: %s", (request) => {
    expect(resolveExactOutputIntent(request)).toBeUndefined();
  });
});
