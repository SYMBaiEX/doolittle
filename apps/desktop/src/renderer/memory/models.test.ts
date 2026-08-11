import { describe, expect, it } from "vitest";
import { memoryResourcePolicy } from "./models";

describe("memory resource policy", () => {
  it.each(["shared", "user", "profiles"] as const)(
    "loads only the visible %s workspace",
    (section) => {
      expect(memoryResourcePolicy(section, true)).toEqual({
        shared: section === "shared",
        user: section === "user",
        profiles: section === "profiles",
      });
    },
  );

  it("disables every memory resource when the route is inactive", () => {
    expect(memoryResourcePolicy("shared", false)).toEqual({
      shared: false,
      user: false,
      profiles: false,
    });
  });
});
