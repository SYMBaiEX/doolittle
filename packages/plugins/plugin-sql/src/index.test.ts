import { describe, expect, it, vi } from "bun:test";
import type { IAgentRuntime, Relationship } from "@elizaos/core";
import { __testing } from "./index";

describe("@elizaos/plugin-sql compatibility patch", () => {
  it("updates an existing relationship instead of retrying a duplicate insert", async () => {
    const existing: Relationship = {
      id: "rel-1",
      sourceEntityId: "source-1",
      targetEntityId: "target-1",
      agentId: "agent-1",
      tags: ["rolodex", "colleague"],
      metadata: { strength: 0.5, lastAnalyzed: 1 },
      createdAt: new Date().toISOString(),
    };

    const createRelationship = vi.fn().mockResolvedValue(true);
    const getRelationship = vi.fn().mockResolvedValue(existing);
    const updateRelationship = vi.fn().mockResolvedValue(undefined);

    const adapter = {
      createRelationship,
      getRelationship,
      updateRelationship,
    };

    __testing.patchDatabaseAdapter({
      databaseAdapter: adapter,
    } as unknown as IAgentRuntime);

    const created = await adapter.createRelationship({
      sourceEntityId: "source-1",
      targetEntityId: "target-1",
      tags: ["updated", "colleague"],
      metadata: { lastInteractionAt: "now" },
    });

    expect(created).toBe(true);
    expect(createRelationship).not.toHaveBeenCalled();
    expect(updateRelationship).toHaveBeenCalledWith({
      ...existing,
      tags: ["rolodex", "colleague", "updated"],
      metadata: {
        strength: 0.5,
        lastAnalyzed: 1,
        lastInteractionAt: "now",
      },
    });
  });

  it("recovers by updating after a failed create when the relationship already exists", async () => {
    const existing: Relationship = {
      id: "rel-2",
      sourceEntityId: "source-2",
      targetEntityId: "target-2",
      agentId: "agent-1",
      tags: ["rolodex"],
      metadata: { strength: 0.4 },
      createdAt: new Date().toISOString(),
    };

    const createRelationship = vi.fn().mockResolvedValue(false);
    const getRelationship = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const updateRelationship = vi.fn().mockResolvedValue(undefined);

    const adapter = {
      createRelationship,
      getRelationship,
      updateRelationship,
    };

    __testing.patchDatabaseAdapter({
      databaseAdapter: adapter,
    } as unknown as IAgentRuntime);

    const created = await adapter.createRelationship({
      sourceEntityId: "source-2",
      targetEntityId: "target-2",
      tags: ["updated"],
      metadata: { lastInteractionAt: "later" },
    });

    expect(created).toBe(true);
    expect(createRelationship).toHaveBeenCalledTimes(1);
    expect(updateRelationship).toHaveBeenCalledWith({
      ...existing,
      tags: ["rolodex", "updated"],
      metadata: {
        strength: 0.4,
        lastInteractionAt: "later",
      },
    });
  });
});
