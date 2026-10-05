import { describe, expect, it } from "vitest";
import { sessionBotId } from "./bot-selection";
import {
  loadSessionBindings,
  saveSessionBindings,
  loadSessionProjectBindings,
  saveSessionProjectBindings,
  sessionProjectTarget,
} from "./session-bindings";

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
describe("presentation ownership cache", () => {
  it("preserves captured project and explicit unscoped drafts across restart", () => {
    const store = storage();
    saveSessionProjectBindings(store, {
      alpha: "project-alpha",
      loose: null,
      "bad/path": "no",
    });
    const restored = loadSessionProjectBindings(store);
    expect(restored).toEqual({ alpha: "project-alpha", loose: null });
    expect(sessionProjectTarget("alpha", [], restored)).toEqual({
      projectId: "project-alpha",
    });
    expect(sessionProjectTarget("loose", [], restored)).toEqual({});
    expect(sessionProjectTarget("unknown", [], restored)).toBeUndefined();
  });
  it("saved project ownership wins including explicitly unscoped saved sessions", () => {
    const local = { chat: "stale", loose: "stale" };
    expect(
      sessionProjectTarget(
        "chat",
        [{ sessionId: "chat", projectId: "saved" }],
        local,
      ),
    ).toEqual({ projectId: "saved" });
    expect(
      sessionProjectTarget("loose", [{ sessionId: "loose" }], local),
    ).toEqual({});
  });
  it("retains unsent conversation bindings after restart", () => {
    const store = storage();
    expect(saveSessionBindings(store, { chat: "specialist" })).toBe(true);
    expect(loadSessionBindings(store)).toEqual({ chat: "specialist" });
  });
  it("never retargets an unknown saved draft to the currently selected/default bot", () => {
    expect(sessionBotId("unknown", [], {}, "lead")).toBe("");
    expect(
      sessionBotId(
        "chat",
        [
          {
            sessionId: "chat",
            botId: "specialist",
            messageCount: 0,
            participants: [],
            preview: [],
          },
        ],
        { chat: "lead" },
        "lead",
      ),
    ).toBe("specialist");
  });
  it("filters invalid and prototype-like owner data", () => {
    const store = storage();
    saveSessionBindings(store, { "bad/path": "lead", chat: "specialist" });
    expect(loadSessionBindings(store)).toEqual({ chat: "specialist" });
  });
});
