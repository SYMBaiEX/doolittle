import { describe, expect, it } from "vitest";
import { buildToolCatalogItems } from "./tool-catalog-model";

describe("tool catalog model", () => {
  const items = buildToolCatalogItems([
    {
      id: "READ_FILE",
      name: "Read file",
      description: "Read a workspace file.",
      category: "workspace",
      transport: "native",
      source: "eliza-action",
      enabled: true,
      similes: ["OPEN_FILE"],
      allowedProfiles: ["coding", "full"],
    },
    {
      id: "SEND_MESSAGE",
      category: "messaging",
      enabled: false,
      policyReason: "Not available in the coding profile.",
    },
  ]);

  it("projects the complete Eliza tool inventory into presentation data", () => {
    expect(items[0]).toEqual({
      id: "READ_FILE",
      title: "Read file",
      description: "Read a workspace file.",
      category: "workspace",
      transport: "native",
      source: "eliza-action",
      enabled: true,
      policyReason: "",
      aliases: ["OPEN_FILE"],
      allowedProfiles: ["coding", "full"],
    });
    expect(items[1]).toMatchObject({
      id: "SEND_MESSAGE",
      title: "SEND_MESSAGE",
      description: "No description provided.",
      category: "messaging",
      enabled: false,
      policyReason: "Not available in the coding profile.",
    });
  });
});
