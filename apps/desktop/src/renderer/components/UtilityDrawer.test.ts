import { describe, expect, it } from "vitest";
import {
  filterUtilitySections,
  type UtilityDrawerSection,
  utilityResultCount,
} from "./UtilityDrawer";

type TestView = "chat" | "models" | "settings";

const sections: UtilityDrawerSection<TestView>[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "chat", label: "Chat", description: "Continue a conversation" },
    ],
  },
  {
    id: "agent",
    label: "Agent",
    items: [
      {
        id: "models",
        label: "Models",
        description: "Choose inference providers",
      },
      { id: "settings", label: "Settings", description: "Configure Doolittle" },
    ],
  },
];

describe("UtilityDrawer helpers", () => {
  it("returns the complete navigation without a filter", () => {
    expect(filterUtilitySections(sections, " ")).toEqual(sections);
  });

  it("matches labels, descriptions, and section labels without empty groups", () => {
    expect(filterUtilitySections(sections, "provider")).toEqual([
      { ...sections[1], items: [sections[1].items[0]] },
    ]);
    expect(filterUtilitySections(sections, "workspace")).toEqual([sections[0]]);
    expect(filterUtilitySections(sections, "missing")).toEqual([]);
  });

  it("counts the visible results after filtering", () => {
    expect(utilityResultCount(filterUtilitySections(sections, "agent"))).toBe(
      2,
    );
    expect(utilityResultCount(filterUtilitySections(sections, "chat"))).toBe(1);
  });
});
