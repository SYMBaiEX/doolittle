import { describe, expect, it } from "vitest";
import {
  buildCommandPaletteMatches,
  type CommandGroup,
  getFocusableCommandIndexes,
  nextFocusableCommandIndex,
} from "./command-palette-model";

const groups: CommandGroup[] = [
  {
    id: "actions",
    label: "Actions",
    items: [
      {
        id: "terminal",
        label: "Open terminal",
        description: "Toggle the workspace shell",
        keywords: ["shell"],
      },
      {
        id: "disabled",
        label: "Unavailable action",
        disabled: true,
      },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    items: [{ id: "doolittle", label: "Doolittle repository" }],
  },
];

describe("command palette model", () => {
  it("matches label, description, and keyword text while retaining groups", () => {
    expect(
      buildCommandPaletteMatches(groups, "terminal").flattened.map(
        (entry) => entry.optionId,
      ),
    ).toEqual(["actions:terminal"]);
    expect(
      buildCommandPaletteMatches(groups, "workspace shell").flattened.map(
        (entry) => entry.id,
      ),
    ).toEqual(["terminal"]);
    expect(
      buildCommandPaletteMatches(groups, "repository").grouped.map(
        (group) => group.groupId,
      ),
    ).toEqual(["projects"]);
  });

  it("ranks exact and prefix label matches ahead of weaker matches", () => {
    const ranked = buildCommandPaletteMatches(
      [
        {
          id: "ranked",
          label: "Ranked",
          items: [
            {
              id: "description",
              label: "Workspace",
              description: "Open terminal",
            },
            { id: "prefix", label: "Terminal settings" },
            { id: "exact", label: "Terminal" },
          ],
        },
      ],
      "terminal",
    );
    expect(ranked.flattened.map((entry) => entry.id)).toEqual([
      "exact",
      "prefix",
      "description",
    ]);
  });

  it("skips disabled commands and wraps keyboard navigation", () => {
    const { flattened } = buildCommandPaletteMatches(groups, "");
    const focusable = getFocusableCommandIndexes(flattened);
    expect(focusable).toEqual([0, 2]);
    expect(nextFocusableCommandIndex(focusable, -1, 1)).toBe(0);
    expect(nextFocusableCommandIndex(focusable, 0, -1)).toBe(2);
    expect(nextFocusableCommandIndex(focusable, 2, 1)).toBe(0);
  });
});
