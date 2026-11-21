import { expect, it, vi } from "vitest";
import type { DisplayMessage } from "../../apps/desktop/src/renderer/chat/models";
import {
  loadStoredChatMessages,
  saveStoredChatMessages,
} from "../../apps/desktop/src/renderer/chat/transcript-cache";

function message(
  id: string,
  content: string,
  createdAt = "2026-01-01T00:00:00.000Z",
): DisplayMessage {
  return { id, content, createdAt, role: "assistant" };
}

function cache() {
  let value = "";
  return {
    getItem: () => value,
    setItem: vi.fn((_key: string, serialized: string) => {
      value = serialized;
    }),
  };
}

it("keeps the selected conversation and trims later entries within the same cache budget", () => {
  const storage = cache();
  const selectedId = 'older:\\"chat';
  const selectedMessages = Array.from({ length: 51 }, (_, index) =>
    message(`selected:${index}`, "x".repeat(90_000)),
  );
  const newer = Array.from({ length: 20 }, (_, index) =>
    message(`newer:${index}`, "\\".repeat(50_000), "2026-01-02T00:00:00.000Z"),
  );
  const pending = {
    ...message("ongoing", 'text with "quotes"'),
    pending: true,
  };

  expect(
    saveStoredChatMessages(
      storage,
      { [selectedId]: selectedMessages, newer, "42": [pending] },
      selectedId,
    ),
  ).toBe(true);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(storage.getItem().length).toBeLessThanOrEqual(3_500_000);
  const persisted = loadStoredChatMessages(storage);
  expect(persisted.newer).toBeUndefined();
  expect(persisted["42"]).toEqual([pending]);
  expect(persisted[selectedId]).toHaveLength(50);
  expect(persisted[selectedId][0]).toMatchObject({
    id: "selected:1",
    content: `${"x".repeat(32_000)}\n\n[Local transcript cache truncated]`,
  });
});

it("keeps malformed cache rows and storage failures outside the live conversation state", () => {
  const storage = cache();
  storage.setItem("ignored", '{"old":[null,{"id":"broken"}]}');
  expect(loadStoredChatMessages(storage)).toEqual({ old: [] });
  storage.setItem.mockImplementation(() => {
    throw new Error("storage quota unavailable");
  });
  expect(
    saveStoredChatMessages(storage, { new: [message("live", "safe")] }),
  ).toBe(false);
});
