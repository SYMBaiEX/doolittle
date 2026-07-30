import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionService } from "@doolittle/agent/services/session/service";
import {
  type IAgentRuntime,
  LongTermMemoryCategory,
  type MemoryStorageProvider,
  type UUID,
} from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { createMemoryStorageService } from "./memory-storage-service";

const agentId = "00000000-0000-4000-8000-000000000001" as UUID;
const entityId = "00000000-0000-4000-8000-000000000002" as UUID;

async function createProvider(root: string): Promise<MemoryStorageProvider> {
  const ServiceClass = createMemoryStorageService(new SessionService(root));
  return (await ServiceClass.start({
    agentId,
  } as IAgentRuntime)) as unknown as MemoryStorageProvider;
}

describe("Eliza memory storage plugin service", () => {
  it("persists the official long-term memory contract across runtime recreation", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-memory-storage-"));
    try {
      const first = await createProvider(root);
      await first.storeLongTermMemory({
        agentId,
        entityId,
        category: LongTermMemoryCategory.SEMANTIC,
        content: "The user prefers concise release summaries.",
        metadata: {
          source: "unit-test",
        },
      });

      const restarted = await createProvider(root);
      const memories = await restarted.getLongTermMemories(agentId, entityId, {
        category: LongTermMemoryCategory.SEMANTIC,
      });

      expect(memories).toHaveLength(1);
      expect(memories[0]?.content).toBe(
        "The user prefers concise release summaries.",
      );
      expect(memories[0]?.metadata?.source).toBe("unit-test");
      expect(memories[0]?.createdAt).toBeInstanceOf(Date);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
