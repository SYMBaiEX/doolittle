// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import { desktopQueryClient } from "../../apps/desktop/src/renderer/lib";
import { ReviewPage } from "../../apps/desktop/src/renderer/ReviewPage";
import type { ReviewRecordResponse } from "../../apps/desktop/src/renderer/review-comments";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const workspacePath = "/workspace/review-comment-guard";
const origin = {
  botId: "bot-1",
  originConversationId: "chat-1",
  workspacePath,
};
const now = "2026-02-20T12:00:00.000Z";
const emptyRecord: ReviewRecordResponse["record"] = {
  scope: {
    repositoryRoot: workspacePath,
    branch: "review-branch",
    head: "abc123",
  },
  comments: [],
  events: [],
  updatedAt: now,
};

function mountPage() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <ReviewPage
        active
        computerOrigin={origin}
        onSendToChat={vi.fn(async () => true)}
        projectScope="project-1"
        workspacePath={workspacePath}
      />,
    ),
  );
  return { host, root };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function buttonByText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

describe("review comment save guard", () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;
  let commentPostResolvers: Array<(value: ReviewRecordResponse) => void> = [];

  beforeEach(() => {
    vi.stubGlobal("doolittle", {
      platform: "darwin",
      mutateRepository: vi.fn(),
    });
    window.localStorage.clear();
    commentPostResolvers = [];
    vi.mocked(desktopRequest).mockImplementation(async (path, method) => {
      if (method === "GET" || !method) {
        if (path === "/execution/approvals") return { approvals: [] };
        if (path === "/codegen/runs") return { runs: [] };
        if (path === "/repo/review") {
          return {
            review: {
              state: "ready",
              local: {
                isRepository: true,
                root: workspacePath,
                branch: "review-branch",
                head: "abc123",
                ahead: 0,
                behind: 0,
                dirty: true,
                changedFiles: 1,
              },
              checks: [],
              workflowRuns: [],
              fetchedAt: now,
            },
          };
        }
        if (path === "/repo/changes") {
          return {
            changes: [
              {
                path: "src/reviewed-file.ts",
                indexStatus: " ",
                worktreeStatus: "M",
                staged: false,
                unstaged: true,
                untracked: false,
              },
            ],
          };
        }
        if (path === "/review-record?limit=80") {
          return { record: emptyRecord };
        }
        if (path.startsWith("/repo/patch?")) {
          return {
            patch: {
              path: "src/reviewed-file.ts",
              staged: false,
              patch:
                "diff --git a/src/reviewed-file.ts b/src/reviewed-file.ts\n@@ -1 +1 @@\n-old\n+new\n",
            },
          };
        }
      }
      if (path === "/review-record/comments" && method === "POST") {
        return new Promise<ReviewRecordResponse>((resolve) => {
          commentPostResolvers.push(resolve);
        });
      }
      throw new Error(`Unexpected desktop request: ${method ?? "GET"} ${path}`);
    });
  });

  afterEach(() => {
    for (const resolve of commentPostResolvers.splice(0)) {
      resolve({ record: emptyRecord });
    }
    if (root) act(() => root.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
    desktopQueryClient.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("submits a note once while the first save is still in flight", async () => {
    ({ host, root } = mountPage());
    await flush();
    if (!host) throw new Error("Review page host is missing.");

    const addLineButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="Add review note on new line 1"]',
    );
    if (!addLineButton) throw new Error("Patch line comment button missing.");
    act(() => addLineButton.click());
    await flush();

    const draft = host.querySelector<HTMLTextAreaElement>(
      "#review-comment-draft",
    );
    if (!draft) throw new Error("Review note editor missing.");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(draft, "Please tighten this conditional.");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const save = buttonByText(host, "Save note");
    act(() => {
      save.click();
      save.click();
    });

    const createPostCount = vi
      .mocked(desktopRequest)
      .mock.calls.filter(
        ([path, method]) =>
          path === "/review-record/comments" && method === "POST",
      ).length;
    expect(createPostCount).toBe(1);
    expect(save.disabled).toBe(true);

    act(() => {
      host
        ?.querySelector<HTMLTextAreaElement>("#review-comment-draft")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            metaKey: true,
            bubbles: true,
          }),
        );
    });
    const shortcutPostCount = vi
      .mocked(desktopRequest)
      .mock.calls.filter(
        ([path, method]) =>
          path === "/review-record/comments" && method === "POST",
      ).length;
    expect(shortcutPostCount).toBe(1);

    await act(async () => {
      for (const resolve of commentPostResolvers.splice(0)) {
        resolve({ record: emptyRecord });
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });
});
