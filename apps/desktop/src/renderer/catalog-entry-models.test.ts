import { describe, expect, it } from "vitest";
import { buildSkillCatalogEntries } from "./catalog-entry-models";

describe("catalog entry models", () => {
  it("puts skill purpose inline without repeating category chrome", () => {
    expect(
      buildSkillCatalogEntries([
        {
          slug: "authoring",
          name: "Authoring",
          description: "Create and revise technical content.",
          category: "authoring",
        },
      ])[0],
    ).toEqual({
      id: "authoring",
      title: "Authoring",
      description: "Create and revise technical content.",
      descriptionMode: "inline",
      code: "authoring",
    });
  });
});
