import { describe, expect, it } from "bun:test";
import type { DesktopRunUpdate } from "./contracts";
import { parseSseBlock, SseParser } from "./sse";

describe("SSE parsing", () => {
  it("parses named JSON events", () => {
    expect(
      parseSseBlock(
        'event: response.output_text.delta\ndata: {"delta":"hello"}',
      ),
    ).toEqual({
      event: "response.output_text.delta",
      data: { delta: "hello" },
    });
  });

  it("buffers split chunks and supports multiline data", () => {
    const parser = new SseParser();
    expect(parser.push("event: agent.progress\nda")).toEqual([]);
    expect(parser.push('ta: {"event":"tool"}\n\n')).toEqual([
      { event: "agent.progress", data: { event: "tool" } },
    ]);
    expect(parser.push("data: one\ndata: two")).toEqual([]);
    expect(parser.finish()).toEqual([{ event: "message", data: "one\ntwo" }]);
  });

  it("preserves structured agent run updates", () => {
    const update = {
      type: "local-mutation",
      sessionId: "room-1",
      run: {
        runId: "run-1",
        sessionId: "room-1",
        roomId: "room-1",
        source: "desktop",
        message: "update the file",
        runDepth: "standard",
        configuredMaxIterations: 45,
        observedActionCount: 1,
        progressMode: "all",
        status: "acting",
        localMutations: [
          {
            action: "write",
            requestedPath: "README.md",
            resolvedPath: "/workspace/README.md",
            success: true,
            bytes: 12,
            recordedAt: "2026-07-27T12:00:01.000Z",
          },
        ],
        pendingApprovals: 0,
        startedAt: "2026-07-27T12:00:00.000Z",
        updatedAt: "2026-07-27T12:00:01.000Z",
      },
    } satisfies DesktopRunUpdate;

    expect(
      parseSseBlock(`event: agent.run\ndata: ${JSON.stringify(update)}`),
    ).toEqual({
      event: "agent.run",
      data: update,
    });
  });
});
