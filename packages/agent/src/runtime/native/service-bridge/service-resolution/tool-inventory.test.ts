import { describe, expect, it } from "vitest";
import type { AppServices } from "@/services";
import {
  getEffectiveToolInventory,
  searchEffectiveTools,
} from "./tool-inventory";

function services(): AppServices {
  return {
    tools: {
      list: () => [
        {
          id: "workspace.read",
          name: "Workspace Read",
          category: "workspace",
          description: "Product fallback.",
          enabled: true,
          transport: "service",
        },
      ],
      summary: () => ({
        total: 1,
        enabled: 1,
        disabled: 0,
        categories: [],
        transports: [],
      }),
    },
  } as unknown as AppServices;
}

describe("effective tool inventory", () => {
  it("uses registered Eliza actions as executable tool truth", () => {
    const runtime = {
      getAllActions: () => [
        {
          name: "READ_FILE",
          description: "Read a workspace file.",
          similes: ["OPEN_FILE"],
        },
        {
          name: "READ_FILE",
          description: "Duplicate registration.",
        },
      ],
    };

    const inventory = getEffectiveToolInventory(runtime as never, services());

    expect(inventory.runtimeOwned).toBe(true);
    expect(inventory.tools).toEqual([
      expect.objectContaining({
        id: "READ_FILE",
        description: "Read a workspace file.",
        source: "eliza-action",
        similes: ["OPEN_FILE"],
      }),
    ]);
    expect(inventory.summary).toMatchObject({
      total: 1,
      enabled: 1,
      runtimeOwned: true,
      controlPlane: { total: 1 },
    });
    expect(
      searchEffectiveTools(runtime as never, services(), "open_file"),
    ).toHaveLength(1);
  });

  it("falls back to the product catalog before runtime actions are available", () => {
    const inventory = getEffectiveToolInventory({}, services());

    expect(inventory.runtimeOwned).toBe(false);
    expect(inventory.tools).toEqual([
      expect.objectContaining({
        id: "workspace.read",
        source: "product-fallback",
      }),
    ]);
  });
});
