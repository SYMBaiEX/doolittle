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
          description: "Control-plane catalog entry.",
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
    expect(inventory.policyOwned).toBe(false);
    expect(inventory.effectiveProfile).toBe("full");
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
      policyOwned: false,
      effectiveProfile: "full",
      profiles: [],
      controlPlane: { total: 1 },
    });
    expect(
      searchEffectiveTools(runtime as never, services(), "open_file"),
    ).toHaveLength(1);
  });

  it("does not present control-plane catalog entries as executable tools", () => {
    const inventory = getEffectiveToolInventory({}, services());

    expect(inventory.runtimeOwned).toBe(false);
    expect(inventory.policyOwned).toBe(false);
    expect(inventory.tools).toEqual([]);
    expect(inventory.summary).toMatchObject({
      total: 0,
      enabled: 0,
      runtimeOwned: false,
      controlPlane: { total: 1 },
    });
  });

  it("treats an empty registered action set as runtime-owned truth", () => {
    const inventory = getEffectiveToolInventory(
      { getAllActions: () => [] },
      services(),
    );

    expect(inventory.runtimeOwned).toBe(true);
    expect(inventory.tools).toEqual([]);
  });

  it("projects registered actions through the official Eliza tool policy", () => {
    const runtime = {
      getAllActions: () => [
        {
          name: "READ_FILE",
          description: "Read a workspace file.",
        },
        {
          name: "SHELL",
          description: "Run a shell command.",
        },
        {
          name: "SEND_MESSAGE",
          description: "Send a message.",
        },
      ],
      getService: (name: string) =>
        name === "tool_policy"
          ? {
              getAllowedTools: (
                context: { profile?: string },
                availableTools: string[],
              ) => {
                const allowed = {
                  minimal: ["READ_FILE"],
                  coding: ["READ_FILE", "SHELL"],
                  messaging: ["READ_FILE", "SEND_MESSAGE"],
                  full: availableTools,
                }[context.profile ?? "full"];
                return allowed ?? [];
              },
              getDeniedTools: (context: { profile?: string }) =>
                context.profile === "coding"
                  ? [
                      {
                        name: "SEND_MESSAGE",
                        reason: "Messaging tools are disabled in coding mode.",
                      },
                    ]
                  : [],
            }
          : null,
    };

    const inventory = getEffectiveToolInventory(runtime as never, services(), {
      profile: "coding",
    });

    expect(inventory).toMatchObject({
      runtimeOwned: true,
      policyOwned: true,
      effectiveProfile: "coding",
      summary: {
        total: 3,
        enabled: 2,
        disabled: 1,
        policyOwned: true,
        effectiveProfile: "coding",
      },
    });
    expect(inventory.summary.profiles).toEqual([
      { profile: "minimal", total: 3, allowed: 1, denied: 2 },
      { profile: "coding", total: 3, allowed: 2, denied: 1 },
      { profile: "messaging", total: 3, allowed: 2, denied: 1 },
      { profile: "full", total: 3, allowed: 3, denied: 0 },
    ]);
    expect(inventory.tools).toEqual([
      expect.objectContaining({
        id: "READ_FILE",
        enabled: true,
        allowedProfiles: ["minimal", "coding", "messaging", "full"],
      }),
      expect.objectContaining({
        id: "SHELL",
        enabled: true,
        allowedProfiles: ["coding", "full"],
      }),
      expect.objectContaining({
        id: "SEND_MESSAGE",
        enabled: false,
        allowedProfiles: ["messaging", "full"],
        policyReason: "Messaging tools are disabled in coding mode.",
      }),
    ]);
  });

  it("surfaces policy failures without hiding registered actions", () => {
    const runtime = {
      getAllActions: () => [{ name: "READ_FILE" }],
      getService: (name: string) =>
        name === "tool_policy"
          ? {
              getAllowedTools: () => {
                throw new Error("policy unavailable");
              },
            }
          : null,
    };

    const inventory = getEffectiveToolInventory(runtime as never, services());

    expect(inventory.policyOwned).toBe(false);
    expect(inventory.policyError).toBe("policy unavailable");
    expect(inventory.tools).toEqual([
      expect.objectContaining({ id: "READ_FILE", enabled: true }),
    ]);
    expect(inventory.summary).toMatchObject({
      policyOwned: false,
      policyError: "policy unavailable",
      profiles: [],
    });
  });
});
