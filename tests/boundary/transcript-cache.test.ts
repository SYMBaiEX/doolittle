import { expect, it, vi } from "vitest";
import type { DisplayMessage } from "../../apps/desktop/src/renderer/chat/models";
import {
  createTranscriptCacheWriter,
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

it("writes the latest streaming edit at a bounded interval and flushes the final state", () => {
  vi.useFakeTimers();
  try {
    const storage = cache();
    const report = vi.fn();
    const writer = createTranscriptCacheWriter(storage, report);
    const saved = [message("saved", "A previous chat")];
    for (let frame = 1; frame <= 10; frame++) {
      writer.schedule(
        { saved, live: [message("live", "x".repeat(frame))] },
        "live",
      );
      vi.advanceTimersByTime(16);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(loadStoredChatMessages(storage).live?.[0]?.content).toBe(
      "x".repeat(10),
    );

    writer.schedule({ saved, live: [message("live", "Finished")] }, "live");
    writer.flush();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(loadStoredChatMessages(storage)).toEqual({
      saved,
      live: [message("live", "Finished")],
    });
    vi.runAllTimers();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(report.mock.calls).toEqual([[true], [true]]);
  } finally {
    vi.useRealTimers();
  }
});

it("keeps the normal cache budget when a compact conversation becomes inactive", () => {
  const storage = cache();
  const writer = createTranscriptCacheWriter(storage, () => undefined);
  const long = Array.from({ length: 50 }, (_, index) =>
    message(`message:${index}`, "x".repeat(90_000)),
  );
  const next = [message("next", "Another conversation")];
  writer.schedule({ long, next }, "long");
  writer.flush();
  expect(
    loadStoredChatMessages(storage).long?.[0]?.content.length,
  ).toBeLessThan(90_000);

  writer.schedule({ long, next }, "next");
  writer.flush();
  expect(loadStoredChatMessages(storage)).toEqual({ next });
});
