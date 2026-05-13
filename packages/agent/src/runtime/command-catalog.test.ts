import { describe, expect, it } from "bun:test";
import {
  COMMAND_CATALOG,
  renderCommandCatalog,
  suggestCommands,
} from "./command-catalog";

describe("command catalog", () => {
  it("exposes the static catalog through the canonicalized facade", () => {
    expect(
      COMMAND_CATALOG.some(
        (entry) =>
          entry.command === "/transport-status" && entry.category === "runtime",
      ),
    ).toBe(true);
    expect(
      COMMAND_CATALOG.some(
        (entry) =>
          entry.command === "/workspace-tree" && entry.category === "workspace",
      ),
    ).toBe(true);
    expect(
      COMMAND_CATALOG.some(
        (entry) => entry.command === "/retry" && entry.category === "runtime",
      ),
    ).toBe(true);
    expect(
      COMMAND_CATALOG.some(
        (entry) => entry.command === "/pulse" && entry.category === "runtime",
      ),
    ).toBe(true);
    expect(
      COMMAND_CATALOG.some(
        (entry) =>
          entry.command === "/todo-list" && entry.category === "runtime",
      ),
    ).toBe(true);
  });

  it("suggests relevant commands from the split static catalog", () => {
    const suggestions = suggestCommands("accounts login", 5);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(
      suggestions.some((entry) => entry.command.startsWith("/accounts-login")),
    ).toBe(true);
  });

  it("renders normalized catalog lines", () => {
    const rendered = renderCommandCatalog("transport", 3);

    expect(rendered).toContain("/transport inventory");
    expect(rendered.split("\n").every((line) => line.includes(" — "))).toBe(
      true,
    );
  });
});
