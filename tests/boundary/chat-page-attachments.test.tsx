// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useChatAttachments } from "../../apps/desktop/src/renderer/chat/page/useChatAttachments";
import { desktopRequest } from "../../apps/desktop/src/renderer/lib";
import { ChatWorkspaceProvider } from "../../apps/desktop/src/renderer/session-workspace/chat-workspace-store";
import type {
  AttachmentSelection,
  ManagedAttachmentDescriptor,
} from "../../apps/desktop/src/shared/contracts";

vi.mock("../../apps/desktop/src/renderer/lib", () => ({
  desktopRequest: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

const bridge = {
  pickChatAttachments: vi.fn(),
  discardChatAttachments: vi.fn(),
  importRecordedAudio: vi.fn(),
  discardRecordedAudio: vi.fn(),
};
const previousBridge = Object.getOwnPropertyDescriptor(window, "doolittle");
const cleanups: Array<() => void> = [];

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "doolittle", {
    configurable: true,
    value: bridge,
  });
  vi.resetAllMocks();
  bridge.discardChatAttachments.mockResolvedValue(undefined);
  bridge.discardRecordedAudio.mockResolvedValue(undefined);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  if (previousBridge)
    Object.defineProperty(window, "doolittle", previousBridge);
  else Reflect.deleteProperty(window, "doolittle");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function attachment(id: string): ManagedAttachmentDescriptor {
  return {
    id,
    name: `${id}.txt`,
    kind: "document",
    mimeType: "text/plain",
    sizeBytes: 1,
    sha256: "a".repeat(64),
  };
}

type AttachmentOptions = Parameters<typeof useChatAttachments>[0];
type AttachmentControls = ReturnType<typeof useChatAttachments>;
function AttachmentHarness({
  onControls,
  ...options
}: AttachmentOptions & { onControls: (controls: AttachmentControls) => void }) {
  onControls(useChatAttachments(options));
  return null;
}

function renderAttachments(overrides: Partial<AttachmentOptions> = {}) {
  let current!: ReturnType<typeof useChatAttachments>;
  let options: AttachmentOptions = {
    selectedId: "chat-a",
    currentBotId: "bot-a",
    coordinator: false,
    attachedFiles: [],
    draftAttachmentCleanup: {},
    setDraftAttachments: vi.fn(),
    ...overrides,
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (next: Partial<AttachmentOptions> = {}) => {
    options = { ...options, ...next };
    act(() =>
      root.render(
        <ChatWorkspaceProvider>
          <AttachmentHarness
            {...options}
            onControls={(controls) => {
              current = controls;
            }}
          />
        </ChatWorkspaceProvider>,
      ),
    );
  };
  render();
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return {
    get current() {
      return current;
    },
    render,
    options,
  };
}

it("cleans a late file selection in its originating bot without changing the new chat draft", async () => {
  const picker = deferred<AttachmentSelection>();
  bridge.pickChatAttachments.mockReturnValue(picker.promise);
  const view = renderAttachments();
  let pending!: Promise<void>;
  act(() => {
    pending = view.current.pickContextFiles();
  });
  expect(view.current.attachmentImportPending).toBe(true);
  view.render({ selectedId: "chat-b", currentBotId: "bot-b" });
  expect(view.current.attachmentImportPending).toBe(false);
  await act(async () => {
    picker.resolve({
      canceled: false,
      attachments: [attachment("late")],
      cleanupCapability: "lease-a",
    });
    await pending;
  });
  expect(view.options.setDraftAttachments).not.toHaveBeenCalled();
  expect(bridge.discardChatAttachments).toHaveBeenCalledWith({
    botId: "bot-a",
    attachmentIds: ["late"],
    cleanupCapability: "lease-a",
  });
  expect(view.current.attachmentImportPending).toBe(false);
});

it("keeps accepted file context and discards only files rejected by the count limit", async () => {
  const existing = Array.from({ length: 7 }, (_, index) =>
    attachment(`old-${index}`),
  );
  const accepted = attachment("accepted");
  bridge.pickChatAttachments.mockResolvedValue({
    canceled: false,
    attachments: [accepted, attachment("overflow")],
    cleanupCapability: "new-lease",
  });
  const view = renderAttachments({
    attachedFiles: existing,
    draftAttachmentCleanup: { "old-0": "old-lease" },
  });
  await act(async () => {
    await view.current.pickContextFiles();
  });
  expect(view.options.setDraftAttachments).toHaveBeenCalledWith(
    [...existing, accepted],
    {
      "old-0": "old-lease",
      accepted: "new-lease",
    },
  );
  expect(bridge.discardChatAttachments).toHaveBeenCalledWith({
    botId: "bot-a",
    attachmentIds: ["overflow"],
    cleanupCapability: "new-lease",
  });
  expect(view.current.attachmentValidationError).toContain("Up to 8 files");
});

it("groups managed cleanup by capability and retains an explicit queued-message bot", async () => {
  const view = renderAttachments({ currentBotId: "selected-bot" });
  await view.current.cleanupManagedAttachments(
    ["one", "two", "three", "unmanaged"],
    {
      one: "lease-one",
      two: "lease-two",
      three: "lease-one",
    },
    "origin-bot",
  );
  expect(bridge.discardChatAttachments.mock.calls).toEqual([
    [
      {
        botId: "origin-bot",
        attachmentIds: ["one", "three"],
        cleanupCapability: "lease-one",
      },
    ],
    [
      {
        botId: "origin-bot",
        attachmentIds: ["two"],
        cleanupCapability: "lease-two",
      },
    ],
  ]);
});

it("discards a recording cancelled while native import was pending before starting transcription", async () => {
  const imported = deferred<ManagedAttachmentDescriptor>();
  bridge.importRecordedAudio.mockReturnValue(imported.promise);
  const view = renderAttachments();
  const controller = new AbortController();
  const pending = view.current.importAndTranscribeRecording(
    new Uint8Array([1]),
    "audio/webm",
    "dictation.webm",
    controller.signal,
  );
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  imported.resolve(attachment("recording"));
  await rejected;
  expect(bridge.discardRecordedAudio).toHaveBeenCalledWith(
    "recording",
    "bot-a",
  );
  expect(desktopRequest).not.toHaveBeenCalled();
});

it("discards failed transcription imports using the bot that owns the recording", async () => {
  bridge.importRecordedAudio.mockResolvedValue(attachment("recording"));
  vi.mocked(desktopRequest).mockRejectedValue(
    new Error("Transcription failed"),
  );
  const view = renderAttachments();
  await expect(
    view.current.importAndTranscribeRecording(
      new Uint8Array([1]),
      "audio/webm",
      "dictation.webm",
      new AbortController().signal,
    ),
  ).rejects.toThrow("Transcription failed");
  expect(bridge.discardRecordedAudio).toHaveBeenCalledWith(
    "recording",
    "bot-a",
  );
  expect(desktopRequest).toHaveBeenCalledWith(
    "/media/transcribe-attachment",
    "POST",
    {
      attachmentId: "recording",
      name: "dictation.webm",
    },
    expect.any(AbortSignal),
    undefined,
    "bot-a",
  );
});

it("does not restore a file selection after its captured draft attachments changed", async () => {
  const picker = deferred<AttachmentSelection>();
  bridge.pickChatAttachments.mockReturnValue(picker.promise);
  const view = renderAttachments({
    attachedFiles: [attachment("removed")],
    draftAttachmentCleanup: { removed: "old-lease" },
  });
  let pending!: Promise<void>;
  act(() => {
    pending = view.current.pickContextFiles();
  });
  await act(async () => {
    view.current.removeContextFile("removed");
  });
  await act(async () => {
    picker.resolve({
      canceled: false,
      attachments: [attachment("late")],
      cleanupCapability: "new-lease",
    });
    await pending;
  });
  expect(view.options.setDraftAttachments).toHaveBeenCalledExactlyOnceWith(
    [],
    {},
  );
  expect(bridge.discardChatAttachments.mock.calls).toEqual([
    [
      {
        botId: "bot-a",
        attachmentIds: ["removed"],
        cleanupCapability: "old-lease",
      },
    ],
    [
      {
        botId: "bot-a",
        attachmentIds: ["late"],
        cleanupCapability: "new-lease",
      },
    ],
  ]);
});
