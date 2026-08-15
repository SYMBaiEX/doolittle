import { describe, expect, it } from "vitest";
import {
  CONVERSATION_DRAFTS_STORAGE_KEY,
  CONVERSATION_PINS_STORAGE_KEY,
  CONVERSATION_QUEUE_STORAGE_KEY,
  composeQueuedMessage,
  loadConversationDrafts,
  loadConversationPins,
  loadConversationQueue,
  loadPromptLibrary,
  PROMPT_LIBRARY_STORAGE_KEY,
  queuedMessageWorkspaceStatus,
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
    expect(
      saveConversationDrafts(storage, {
        "desktop:one": { text: "draft", capsule: null },
      }),
    ).toBe(false);
    expect(saveConversationQueue(storage, [])).toBe(false);
  });

  it("round trips bounded pins and per-session drafts", () => {
    const storage = memoryStorage();
    saveConversationPins(storage, { "desktop:one": true, ignored: false });
    saveConversationDrafts(storage, {
      "desktop:one": { text: "Keep this draft", capsule: null },
      empty: { text: "", capsule: null },
    });

    expect(loadConversationPins(storage)).toEqual({ "desktop:one": true });
    expect(loadConversationDrafts(storage)).toEqual({
      "desktop:one": { text: "Keep this draft", capsule: null },
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
        object: { text: "no", capsule: {} },
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
    expect(loadConversationDrafts(storage)).toEqual({
      good: { text: "draft", capsule: null },
    });
    expect(loadConversationQueue(storage)).toEqual([
      {
        id: "valid",
        sessionId: "desktop:one",
        content: "Continue the review",
        attachments: [],
      },
    ]);
  });

  it("round trips file and terminal capsules without exposing them as draft text", () => {
    const storage = memoryStorage();
    saveConversationDrafts(storage, {
      file: {
        text: "Review this file",
        capsule: {
          kind: "file",
          path: "src/app.ts",
          source: "workspace",
          content:
            '<file_context path="src/app.ts">const value = 1;</file_context>',
        },
      },
      terminal: {
        text: "What failed?",
        capsule: {
          kind: "terminal",
          path: "Terminal",
          content: "<terminal_context>npm test failed</terminal_context>",
        },
      },
    });

    expect(loadConversationDrafts(storage)).toEqual({
      file: {
        text: "Review this file",
        capsule: {
          kind: "file",
          path: "src/app.ts",
          source: "workspace",
          content:
            '<file_context path="src/app.ts">const value = 1;</file_context>',
        },
      },
      terminal: {
        text: "What failed?",
        capsule: {
          kind: "terminal",
          path: "Terminal",
          content: "<terminal_context>npm test failed</terminal_context>",
        },
      },
    });
  });

  it("sanitizes malformed capsule storage while retaining legacy string drafts", () => {
    const storage = memoryStorage({
      [CONVERSATION_DRAFTS_STORAGE_KEY]: JSON.stringify({
        legacy: "Keep my visible prompt",
        malformedKind: {
          text: "Do not restore",
          capsule: { kind: "shell", path: "Terminal", content: "danger" },
        },
        malformedContent: {
          text: "Do not restore",
          capsule: { kind: "terminal", path: "Terminal", content: "   " },
        },
      }),
    });

    expect(loadConversationDrafts(storage)).toEqual({
      legacy: { text: "Keep my visible prompt", capsule: null },
    });
  });

  it("round trips a valid recovery queue", () => {
    const storage = memoryStorage();
    const queue = [
      {
        id: "queue-1",
        sessionId: "desktop:one",
        workspacePath: "/workspace/one",
        projectId: "project-one",
        content: "Run the focused tests",
        capsule: {
          kind: "terminal",
          path: "Terminal",
          content: "<terminal_context>test output</terminal_context>",
        },
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

  it("fails safe for legacy and cross-workspace queue entries", () => {
    const legacy = {
      id: "legacy",
      sessionId: "desktop:one",
      content: "Review before dispatch",
      attachments: [],
    };
    expect(
      queuedMessageWorkspaceStatus(legacy, "/workspace/one", "darwin"),
    ).toBe("legacy-unbound");
    expect(
      queuedMessageWorkspaceStatus(
        { ...legacy, workspacePath: "/workspace/two" },
        "/workspace/one",
        "darwin",
      ),
    ).toBe("different-workspace");
    expect(
      queuedMessageWorkspaceStatus(
        { ...legacy, workspacePath: "/workspace/one" },
        "/workspace/one",
        "darwin",
      ),
    ).toBe("ready");
  });

  it("migrates legacy composed queue content into a hidden capsule", () => {
    const storage = memoryStorage({
      [CONVERSATION_QUEUE_STORAGE_KEY]: JSON.stringify([
        {
          id: "legacy-queue",
          sessionId: "desktop:one",
          content:
            'Review this.\n\n<file_context path="src/app.ts">const secret = true;</file_context>',
          attachments: [],
        },
      ]),
    });

    expect(loadConversationQueue(storage)).toEqual([
      {
        id: "legacy-queue",
        sessionId: "desktop:one",
        content: "Review this.",
        capsule: {
          kind: "file",
          path: "src/app.ts",
          content:
            '<file_context path="src/app.ts">const secret = true;</file_context>',
        },
        attachments: [],
      },
    ]);
  });

  it("composes a queued capsule from its own session after another chat is selected", () => {
    const queuedFromA = {
      id: "queue-a",
      sessionId: "chat-a",
      content: "Review the failing file",
      capsule: {
        kind: "file" as const,
        path: "src/a.ts",
        content: '<file_context path="src/a.ts">context A</file_context>',
      },
      attachments: [],
    };
    const selectedChatB = {
      kind: "terminal" as const,
      path: "Terminal",
      content: "<terminal_context>context B</terminal_context>",
    };

    const dispatched = composeQueuedMessage(queuedFromA);
    expect(dispatched).toContain("Review the failing file");
    expect(dispatched).toContain("context A");
    expect(dispatched).not.toContain(selectedChatB.content);
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
