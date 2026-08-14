import { describe, expect, it } from "vitest";
import {
  CONVERSATION_DRAFTS_STORAGE_KEY,
  CONVERSATION_PINS_STORAGE_KEY,
  CONVERSATION_QUEUE_STORAGE_KEY,
  loadConversationDrafts,
  loadConversationPins,
  loadConversationQueue,
  loadPromptLibrary,
  PROMPT_LIBRARY_STORAGE_KEY,
  type StorageLike,
  safeSetStorageItem,
  saveConversationDrafts,
  saveConversationPins,
  saveConversationQueue,
  savePromptLibrary,
} from "./conversation-persistence";

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("conversation persistence", () => {
  it("treats storage quota failures as a cache miss instead of throwing", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(safeSetStorageItem(storage, "cache", "value")).toBe(false);
    expect(saveConversationPins(storage, { "desktop:one": true })).toBe(false);
    expect(saveConversationDrafts(storage, { "desktop:one": "draft" })).toBe(
      false,
    );
    expect(saveConversationQueue(storage, [])).toBe(false);
  });

  it("round trips bounded pins and per-session drafts", () => {
    const storage = memoryStorage();
    saveConversationPins(storage, { "desktop:one": true, ignored: false });
    saveConversationDrafts(storage, {
      "desktop:one": "Keep this draft",
      empty: "",
    });

    expect(loadConversationPins(storage)).toEqual({ "desktop:one": true });
    expect(loadConversationDrafts(storage)).toEqual({
      "desktop:one": "Keep this draft",
    });
  });

  it("drops malformed persisted values instead of restoring unsafe state", () => {
    const storage = memoryStorage({
      [CONVERSATION_PINS_STORAGE_KEY]: JSON.stringify({
        good: true,
        falsey: false,
        "\u0000bad": true,
      }),
      [CONVERSATION_DRAFTS_STORAGE_KEY]: JSON.stringify({
        good: "draft",
        object: { text: "no" },
      }),
      [CONVERSATION_QUEUE_STORAGE_KEY]: JSON.stringify([
        {
          id: "valid",
          sessionId: "desktop:one",
          content: "Continue the review",
          attachments: [],
        },
        {
          id: "bad-attachment",
          sessionId: "desktop:one",
          content: "Do not restore",
          attachments: [{ id: "../escape" }],
        },
      ]),
    });

    expect(loadConversationPins(storage)).toEqual({ good: true });
    expect(loadConversationDrafts(storage)).toEqual({ good: "draft" });
    expect(loadConversationQueue(storage)).toEqual([
      {
        id: "valid",
        sessionId: "desktop:one",
        content: "Continue the review",
        attachments: [],
      },
    ]);
  });

  it("round trips a valid recovery queue", () => {
    const storage = memoryStorage();
    const queue = [
      {
        id: "queue-1",
        sessionId: "desktop:one",
        projectId: "project-one",
        content: "Run the focused tests",
        attachments: [],
        memoryMatch: {
          count: 2,
          source: "saved-profile-recall" as const,
        },
      },
    ];
    saveConversationQueue(storage, queue);
    expect(loadConversationQueue(storage)).toEqual(queue);
  });

  it("sanitizes and bounds the prompt library", () => {
    const now = "2026-07-28T12:00:00.000Z";
    const storage = memoryStorage({
      [PROMPT_LIBRARY_STORAGE_KEY]: JSON.stringify([
        {
          id: "invalid-empty",
          title: "Empty",
          content: "  ",
          createdAt: now,
          updatedAt: now,
        },
        ...Array.from({ length: 55 }, (_, index) => ({
          id: `prompt-${index}`,
          title: `  Prompt ${index}  `,
          content: `  Run check ${index}  `,
          ...(index === 0 ? { projectId: "project-one" } : {}),
          createdAt: now,
          updatedAt: now,
        })),
        {
          id: "prompt-0",
          title: "Duplicate",
          content: "Do not restore this",
          createdAt: now,
          updatedAt: now,
        },
      ]),
    });

    const prompts = loadPromptLibrary(storage);
    expect(prompts).toHaveLength(50);
    expect(prompts[0]).toEqual({
      id: "prompt-0",
      title: "Prompt 0",
      content: "Run check 0",
      projectId: "project-one",
      createdAt: now,
      updatedAt: now,
    });
    expect(prompts.at(-1)?.id).toBe("prompt-49");
  });

  it("does not persist malformed prompt entries", () => {
    const now = "2026-07-28T12:00:00.000Z";
    const storage = memoryStorage();
    savePromptLibrary(storage, [
      {
        id: "kept",
        title: "  Focused review  ",
        content: "  Review the current diff  ",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "\u0000unsafe",
        title: "Unsafe",
        content: "Ignore",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(loadPromptLibrary(storage)).toEqual([
      {
        id: "kept",
        title: "Focused review",
        content: "Review the current diff",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });
});
