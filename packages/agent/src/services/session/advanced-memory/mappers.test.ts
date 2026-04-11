import { describe, expect, it } from "bun:test";
import {
  mapLongTermMemoryRow,
  mapSessionSummaryRow,
  parseJsonValue,
} from "./mappers";

describe("session/advanced-memory/mappers", () => {
  it("parses invalid json values safely", () => {
    expect(parseJsonValue<string[]>("{invalid")).toBeUndefined();
  });

  it("maps long-term memory rows with access overrides", () => {
    const memory = mapLongTermMemoryRow(
      {
        id: "memory-1",
        agent_id: "agent-1",
        entity_id: "entity-1",
        category: "semantic",
        content: "Cloud is preferred.",
        metadata: JSON.stringify({ source: "test" }),
        embedding: JSON.stringify([1, 2, 3]),
        confidence: 0.8,
        source: "unit-test",
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:01.000Z",
        last_accessed_at: null,
        access_count: 1,
      },
      {
        lastAccessedAt: "2026-03-20T00:00:02.000Z",
        accessCount: 2,
      },
    );

    expect(memory.metadata?.source).toBe("test");
    expect(memory.embedding).toEqual([1, 2, 3]);
    expect(memory.accessCount).toBe(2);
    expect(memory.lastAccessedAt?.toISOString()).toBe(
      "2026-03-20T00:00:02.000Z",
    );
  });

  it("maps session summary rows into runtime records", () => {
    const summary = mapSessionSummaryRow({
      id: "summary-1",
      agent_id: "agent-1",
      room_id: "room-1",
      entity_id: "entity-1",
      summary: "Discussed runtime defaults.",
      message_count: 5,
      last_message_offset: 5,
      start_time: "2026-03-20T00:00:00.000Z",
      end_time: "2026-03-20T00:05:00.000Z",
      topics: JSON.stringify(["runtime"]),
      metadata: JSON.stringify({ source: "test" }),
      embedding: JSON.stringify([0.1, 0.2]),
      created_at: "2026-03-20T00:06:00.000Z",
      updated_at: "2026-03-20T00:07:00.000Z",
    });

    expect(summary.topics).toEqual(["runtime"]);
    expect(summary.metadata?.source).toBe("test");
    expect(summary.embedding).toEqual([0.1, 0.2]);
  });
});
