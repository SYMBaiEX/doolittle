import { describe, expect, it } from "vitest";
import { nextId, nowIso } from "./record-utils";

describe("record utilities", () => {
  it("uses collision-resistant standard UUIDs while retaining record prefixes", () => {
    expect(nextId("plan")).toMatch(
      /^plan-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it("returns ISO timestamps", () => {
    const timestamp = nowIso();
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
