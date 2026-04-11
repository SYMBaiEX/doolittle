import { describe, expect, it } from "bun:test";
import type { TrajectoryRecord } from "../../../types/trajectory";
import { collectTrajectoryRecords } from "./record-selection";
import type { TrajectoryBundleStorageHost } from "./types";

function createHost(records: TrajectoryRecord[]): TrajectoryBundleStorageHost {
  return {
    baseDir: "/tmp/trajectory-record-selection",
    sessions: {
      recent(limit: number) {
        return records.slice(0, limit);
      },
    },
    slug(value: string) {
      return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    },
  };
}

describe("trajectory bundle record selection", () => {
  const records: TrajectoryRecord[] = [
    {
      sessionId: "session-a",
      createdAt: "2026-03-20T00:00:00.000Z",
      role: "user",
      text: "first",
    },
    {
      sessionId: "session-b",
      createdAt: "2026-03-20T00:00:01.000Z",
      role: "assistant",
      text: "reply",
    },
    {
      sessionId: "session-b",
      createdAt: "2026-03-20T00:00:02.000Z",
      role: "system",
      text: "system",
    },
  ];

  it("collects recent records with session and role filters", () => {
    const host = createHost(records);

    const filteredBySession = collectTrajectoryRecords(host, {
      sessionId: "session-b",
    });
    expect(filteredBySession).toHaveLength(2);
    expect(
      filteredBySession.every((entry) => entry.sessionId === "session-b"),
    ).toBe(true);

    const filteredByRole = collectTrajectoryRecords(host, { role: "system" });
    expect(filteredByRole).toHaveLength(1);
    expect(filteredByRole[0]?.text).toBe("system");

    const limited = collectTrajectoryRecords(host, { limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]?.text).toBe("first");
  });
});
