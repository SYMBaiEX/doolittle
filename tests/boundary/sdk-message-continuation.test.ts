import { randomUUID } from "node:crypto";
import {
  bindIncomingMessagePersistence,
  incomingMessagePersistenceSnapshot,
  type Memory,
  persistIncomingMessageMemory,
} from "@elizaos/core";
import { expect, it, vi } from "vitest";

it("binds prompt-only continuation to the exact original ingress without replacing stored content", async () => {
  const original: Memory = {
    id: randomUUID(),
    agentId: randomUUID(),
    entityId: randomUUID(),
    roomId: randomUUID(),
    content: { text: "Repair this workspace.", source: "cli" },
  };
  const augmented = {
    ...original,
    content: {
      ...original.content,
      text: "Repair this workspace. Continue with verified receipts.",
    },
  };
  const runtime = {
    agentId: original.agentId,
    getMemoriesByIds: async () => [structuredClone(original)],
    redactSecrets: (value: string) => value,
    createMessageMemory: vi.fn(),
  };
  await expect(
    persistIncomingMessageMemory(runtime as never, augmented),
  ).rejects.toThrow("different or incomplete content");
  bindIncomingMessagePersistence(augmented, original);
  const persisted = incomingMessagePersistenceSnapshot(augmented);
  expect(persisted).toEqual(original);
  if (!persisted) throw new Error("Missing original ingress snapshot.");
  await expect(
    persistIncomingMessageMemory(runtime as never, persisted),
  ).resolves.toBe(original.id);
  expect(runtime.createMessageMemory).not.toHaveBeenCalled();
  expect(original.content.text).toBe("Repair this workspace.");
  expect(() =>
    bindIncomingMessagePersistence(
      { ...augmented, id: randomUUID() },
      original,
    ),
  ).toThrow("identity differs");
});
