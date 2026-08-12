import { describe, expect, it } from "vitest";
import {
  buildSkillCatalogEntries,
  buildToolCatalogEntries,
} from "./catalog-entry-models";

describe("catalog entry models", () => {
  it("keeps a single-category native tool catalog concise", () => {
    expect(
      buildToolCatalogEntries([
        {
          id: "CHOOSE_OPTION",
          name: "Choose option",
          description: "Present an explicit choice to the operator.",
          category: "runtime",
          transport: "native",
          enabled: true,
        },
      ]),
    ).toEqual([
      {
        id: "CHOOSE_OPTION",
        title: "Choose option",
        description: "Present an explicit choice to the operator.",
        descriptionMode: "inline",
        status: undefined,
        tone: undefined,
        code: "CHOOSE_OPTION",
        meta: undefined,
        facts: undefined,
        detailsLabel: "Policy",
      },
    ]);
  });

  it("groups mixed tool categories once without reordering within a group", () => {
    expect(
      buildToolCatalogEntries([
        { id: "SEND_MESSAGE", category: "messaging" },
        { id: "READ_FILE", category: "workspace" },
        { id: "LIST_CHANNELS", category: "messaging" },
      ]).map(({ id, group }) => ({ id, group })),
    ).toEqual([
      { id: "SEND_MESSAGE", group: "Messaging" },
      { id: "LIST_CHANNELS", group: "Messaging" },
      { id: "READ_FILE", group: "Workspace" },
    ]);
  });

  it("shows transport and policy only when they are exceptions", () => {
    expect(
      buildToolCatalogEntries([
        {
          id: "REMOTE_TOOL",
          category: "integration",
          transport: "mcp",
          enabled: false,
          policyReason: "Not included in the current profile.",
        },
      ])[0],
    ).toMatchObject({
      meta: "MCP",
      status: "Disabled",
      facts: [
        { label: "Policy", value: "Not included in the current profile." },
      ],
    });
  });

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
