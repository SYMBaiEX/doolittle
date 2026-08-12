import { describe, expect, it } from "vitest";
import { buildSkillCatalogEntries } from "./catalog-entry-models";

describe("catalog entry models", () => {
  it("normalizes the complete skill identity and invocation policy", () => {
    expect(
      buildSkillCatalogEntries([
        {
          slug: "authoring",
          title: "Doolittle Documentation Authoring",
          description: "Create and revise technical content.",
          source: "workspace",
          commandName: "authoring",
          userInvocable: true,
          disableModelInvocation: false,
        },
      ])[0],
    ).toEqual({
      id: "authoring",
      title: "Doolittle Documentation Authoring",
      description: "Create and revise technical content.",
      slug: "authoring",
      family: "authoring",
      source: "workspace",
      commandName: "authoring",
      userInvocable: true,
      modelInvocable: true,
    });
  });

  it("uses safe fallbacks and preserves restricted invocation", () => {
    expect(
      buildSkillCatalogEntries([
        {
          slug: "operations/release",
          userInvocable: false,
          disableModelInvocation: true,
        },
      ])[0],
    ).toMatchObject({
      title: "Operations/Release",
      family: "operations",
      source: "workspace",
      commandName: "operations/release",
      userInvocable: false,
      modelInvocable: false,
    });
  });
});
