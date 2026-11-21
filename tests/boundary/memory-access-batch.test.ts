import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LongTermMemoryCategory, type UUID } from "@elizaos/core";
import { expect, it } from "vitest";
import { ElizaMemoryStorageStore } from "../../packages/agent/src/runtime/native/plugin-registry/product/memory-storage-store";

it("touches only the returned Eliza memories and persists every access count", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-memory-test-"));
  const agentId = "11111111-1111-4111-8111-111111111111" as UUID;
  const entityId = "22222222-2222-4222-8222-222222222222" as UUID;
  const otherEntity = "33333333-3333-4333-8333-333333333333" as UUID;
  const store = new ElizaMemoryStorageStore(directory);
  try {
    await store.storeLongTermMemory({
      agentId,
      entityId,
      category: LongTermMemoryCategory.SEMANTIC,
      content: "First fact",
    });
    await store.storeLongTermMemory({
      agentId,
      entityId,
      category: LongTermMemoryCategory.SEMANTIC,
      content: "Second fact",
    });
    await store.storeLongTermMemory({
      agentId,
      entityId: otherEntity,
      category: LongTermMemoryCategory.SEMANTIC,
      content: "Separate conversation",
    });
    const first = await store.getLongTermMemories(agentId, entityId, {
      limit: 2,
    });
    expect(first).toHaveLength(2);
    expect(first.map((row) => row.accessCount)).toEqual([1, 1]);
    expect(first[0]?.lastAccessedAt).toEqual(first[1]?.lastAccessedAt);
    expect(
      (await store.getLongTermMemories(agentId, entityId)).map(
        (row) => row.accessCount,
      ),
    ).toEqual([2, 2]);
    expect(await store.getLongTermMemories(agentId, otherEntity)).toMatchObject(
      [{ accessCount: 1, content: "Separate conversation" }],
    );
  } finally {
    store.close();
    rmSync(directory, { force: true, recursive: true });
  }
});
