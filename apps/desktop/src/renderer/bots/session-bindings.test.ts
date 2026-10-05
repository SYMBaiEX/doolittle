import { describe, expect, it } from "vitest";
import { sessionBotId } from "./bot-selection";
import { loadSessionBindings, saveSessionBindings } from "./session-bindings";

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
