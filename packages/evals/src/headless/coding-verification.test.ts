import {
  CODING_VERIFICATION_ID,
  type CodingVerificationReceipt,
} from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
import {
  CODING_VERIFICATION_COMMAND,
  CODING_VERIFICATION_STREAM_BYTE_LIMIT,
  CODING_VERIFICATION_STREAM_EVENT_LIMIT,
  CODING_VERIFICATION_STREAM_LINE_BYTE_LIMIT,
  CODING_VERIFICATION_SUCCESS_MARKER,
  createCodingVerificationCollector,
} from "./coding-verification";

const prompt = "Complete the sumFinite task.";
const response = '{"file":"math.mjs","tests":"passed"}';
const timestamp = (second: number) =>
  `2026-10-03T00:00:${String(second).padStart(2, "0")}.000Z`;

function verifiedReceipt(
  overrides: Partial<CodingVerificationReceipt> = {},
): CodingVerificationReceipt {
  return {
    type: "coding-verification",
    timestamp: timestamp(2),
    verifier: CODING_VERIFICATION_ID,
    status: "verified",
    reason: "verified",
    shellStarts: 1,
    shellCompletions: 1,
    verifierMatches: 1,
    success: true,
    exitCode: 0,
    timedOut: false,
    truncated: false,
    workdirMatches: true,
    actionPairMatched: true,
    ...overrides,
  };
}

function cliEvents(
  options: {
    receipt?: CodingVerificationReceipt;
    response?: string;
    includeReceipt?: boolean;
    prefix?: object[];
    suffix?: object[];
  } = {},
): string {
  const events: unknown[] = [
    {
      type: "start",
      timestamp: timestamp(1),
      sessionId: "cli:synthetic",
      command: prompt,
    },
    ...(options.prefix ?? []),
    ...(options.includeReceipt === false
      ? []
      : [options.receipt ?? verifiedReceipt()]),
    ...(options.suffix ?? []),
    {
      type: "result",
      timestamp: timestamp(3),
      text: options.response ?? response,
      tone: "success",
      shouldExit: false,
    },
    { type: "completed", timestamp: timestamp(4), status: "completed" },
  ];
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function collect(
  text: string,
  options: {
    expectedPrompt?: string;
    response?: string;
    executionConfirmed?: boolean;
    cleanupConfirmed?: boolean;
    chunks?: number[];
  } = {},
) {
  const collector = createCodingVerificationCollector(
    options.expectedPrompt ?? prompt,
  );
  const bytes = Buffer.from(text);
  const chunkSizes = options.chunks ?? [bytes.byteLength];
  let offset = 0;
  for (const size of chunkSizes) {
    if (offset >= bytes.byteLength) break;
    const end = Math.min(bytes.byteLength, offset + size);
    collector.onStdoutChunk(bytes.subarray(offset, end));
    offset = end;
  }
  if (offset < bytes.byteLength)
    collector.onStdoutChunk(bytes.subarray(offset));
  return collector.finish({
    response: options.response ?? response,
    executionConfirmed: options.executionConfirmed ?? true,
    cleanupConfirmed: options.cleanupConfirmed ?? true,
  });
}

describe("live original CLI coding-verification event projection", () => {
  it("accepts one internally consistent event at the top level across chunk boundaries", () => {
    const evidence = collect(cliEvents(), { chunks: [1, 2, 7, 3, 13, 5] });
    expect(evidence).toEqual({
      provenance: "original-cli-json-stream",
      status: "verified",
      reason: "verified",
      shellStarts: 1,
      shellCompletions: 1,
      verifierMatches: 1,
    });
    expect(JSON.stringify(evidence)).not.toContain(CODING_VERIFICATION_COMMAND);
    expect(JSON.stringify(evidence)).not.toContain(
      CODING_VERIFICATION_SUCCESS_MARKER,
    );
    expect(Object.keys(evidence).sort()).toEqual([
      "provenance",
      "reason",
      "shellCompletions",
      "shellStarts",
      "status",
      "verifierMatches",
    ]);
  });

  it("does not treat nested progress/result text as a verification event", () => {
    const fake = JSON.stringify(verifiedReceipt());
    const evidence = collect(
      cliEvents({
        includeReceipt: false,
        prefix: [
          {
            type: "progress",
            timestamp: timestamp(1),
            phase: "model",
            chunk: fake,
            delta: fake,
            response: fake,
          },
        ],
        response: `A model claim: ${fake}`,
      }),
      { response: `A model claim: ${fake}` },
    );
    expect(evidence).toMatchObject({
      status: "unavailable",
      reason: "missing-input",
      verifierMatches: 0,
    });
  });

  it("rejects zero, duplicate, and late receipt events", () => {
    expect(collect(cliEvents({ includeReceipt: false }))).toMatchObject({
      status: "unavailable",
      reason: "missing-input",
    });
    expect(
      collect(
        cliEvents({ suffix: [verifiedReceipt({ timestamp: timestamp(2) })] }),
      ),
    ).toMatchObject({ status: "unavailable", reason: "verifier-ambiguous" });
    expect(
      collect(
        cliEvents({
          includeReceipt: false,
          prefix: [
            {
              type: "result",
              timestamp: timestamp(2),
              text: response,
              tone: "success",
              shouldExit: false,
            },
          ],
        }),
      ),
    ).toMatchObject({ status: "unavailable", reason: "identity-unavailable" });
  });

  it.each([
    ["success", { success: false }],
    ["exit code", { exitCode: 1 }],
    ["timeout", { timedOut: true }],
    ["truncation", { truncated: true }],
    ["workdir", { workdirMatches: false }],
    ["action pair", { actionPairMatched: false }],
    ["verifier count", { verifierMatches: 2 }],
    ["unbalanced actions", { shellStarts: 2, shellCompletions: 1 }],
    ["zero action starts", { shellStarts: 0, shellCompletions: 0 }],
    ["wrong reason", { reason: "marker-mismatch" }],
  ] as const)("rejects contradictory verified receipt: %s", (_label, patch) => {
    expect(
      collect(cliEvents({ receipt: verifiedReceipt(patch) })),
    ).toMatchObject({ status: "unavailable", reason: "invalid-input" });
  });

  it("projects a well-formed failed receipt without retaining its event", () => {
    const evidence = collect(
      cliEvents({
        receipt: verifiedReceipt({
          status: "failed",
          reason: "marker-mismatch",
          success: true,
          verifierMatches: 1,
        }),
        response: '{"file":"math.mjs","tests":"unverified"}',
      }),
      { response: '{"file":"math.mjs","tests":"unverified"}' },
    );
    expect(evidence).toMatchObject({
      status: "failed",
      reason: "marker-mismatch",
      verifierMatches: 1,
    });
  });

  it("requires execution and cleanup confirmation even with a valid event", () => {
    expect(collect(cliEvents(), { executionConfirmed: false })).toMatchObject({
      status: "unavailable",
      reason: "execution-unconfirmed",
    });
    expect(collect(cliEvents(), { cleanupConfirmed: false })).toMatchObject({
      status: "unavailable",
      reason: "cleanup-unconfirmed",
    });
  });

  it("binds the event to the expected CLI prompt and result", () => {
    expect(
      collect(cliEvents(), { expectedPrompt: "a different prompt" }),
    ).toMatchObject({ status: "unavailable", reason: "foreign-context" });
    expect(
      collect(cliEvents(), { response: '{"file":"other.mjs"}' }),
    ).toMatchObject({
      status: "unavailable",
      reason: "identity-unavailable",
    });
  });

  it("rejects malformed, extra-key, unknown, and out-of-order frames", () => {
    expect(
      collect(
        cliEvents({
          receipt: verifiedReceipt({ unexpected: "raw secret" } as never),
        }),
      ),
    ).toMatchObject({ status: "unavailable", reason: "invalid-input" });
    expect(
      collect(
        cliEvents({
          prefix: [{ type: "unknown-event", timestamp: timestamp(2) }],
        }),
      ),
    ).toMatchObject({ status: "unavailable", reason: "invalid-input" });
    expect(collect(cliEvents()).provenance).toBe("original-cli-json-stream");
  });

  it("enforces bounded lines, events, and incomplete final framing", () => {
    const oversizedLine = "x".repeat(
      CODING_VERIFICATION_STREAM_LINE_BYTE_LIMIT + 1,
    );
    expect(collect(`${oversizedLine}\n`)).toMatchObject({
      status: "unavailable",
      reason: "truncated-input",
    });

    const collector = createCodingVerificationCollector(prompt);
    collector.onStdoutChunk(
      Buffer.alloc(CODING_VERIFICATION_STREAM_BYTE_LIMIT + 1),
    );
    expect(
      collector.finish({
        response,
        executionConfirmed: true,
        cleanupConfirmed: true,
      }),
    ).toMatchObject({ status: "unavailable", reason: "truncated-input" });

    expect(collect(cliEvents().trimEnd())).toMatchObject({
      status: "unavailable",
      reason: "truncated-input",
    });

    const manyProgress = Array.from(
      { length: CODING_VERIFICATION_STREAM_EVENT_LIMIT + 1 },
      (_, index) =>
        JSON.stringify({
          type: "progress",
          timestamp: timestamp(1),
          phase: "model",
          chunk: String(index),
          response: "",
          delta: "",
        }),
    ).join("\n");
    expect(collect(`${manyProgress}\n${cliEvents()}`)).toMatchObject({
      status: "unavailable",
      reason: "truncated-input",
    });
  });
});
