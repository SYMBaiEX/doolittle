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
import type {
  ReviewComment,
  ReviewRecordResponse,
} from "../../apps/desktop/src/renderer/review-comments";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const workspacePath = "/workspace/review-comment-sync";
const origin = {
  botId: "bot-1",
  originConversationId: "chat-1",
  workspacePath,
};
const now = "2026-02-20T12:00:00.000Z";
const existingComment: ReviewComment = {
  id: "comment-b",
  path: "src/reviewed-file.ts",
  body: "Existing note",
  status: "open",
  createdAt: "2026-02-20T11:59:00.000Z",
  updatedAt: "2026-02-20T11:59:00.000Z",
};
const baseRecord: ReviewRecordResponse["record"] = {
  scope: {
    repositoryRoot: workspacePath,
    branch: "review-branch",
    head: "abc123",
  },
  comments: [existingComment],
  events: [],
  updatedAt: now,
};

function recordWith(comments: ReviewComment[]): ReviewRecordResponse {
  return {
    record: {
      ...baseRecord,
      comments,
      updatedAt: "2026-02-20T12:01:00.000Z",
    },
  };
}

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

async function settle(
  resolve: (value: ReviewRecordResponse) => void,
  value: ReviewRecordResponse,
) {
  await act(async () => {
    resolve(value);
    await new Promise((settlePromise) => setTimeout(settlePromise, 10));
  });
}

function buttonByText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

describe("review comment synchronization", () => {
  let root: Root;
  let host: HTMLElement;
  let createResolvers: Array<(value: ReviewRecordResponse) => void> = [];
  let resolveResolvers: Array<(value: ReviewRecordResponse) => void> = [];
  let resolveRejecters: Array<(error: unknown) => void> = [];
  let createdComment: ReviewComment | undefined;

  beforeEach(() => {
    vi.stubGlobal("doolittle", {
      platform: "darwin",
      mutateRepository: vi.fn(),
    });
    window.localStorage.clear();
    createResolvers = [];
    resolveResolvers = [];
    resolveRejecters = [];
    createdComment = undefined;
    vi.mocked(desktopRequest).mockImplementation(async (path, method, body) => {
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
          return { record: baseRecord };
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
      if (path === "/review-record/comments/migrate" && method === "POST") {
        return { record: baseRecord };
      }
      if (path === "/review-record/comments" && method === "POST") {
        createdComment = (body as { comment: ReviewComment }).comment;
        return new Promise<ReviewRecordResponse>((resolve) => {
          createResolvers.push(resolve);
        });
      }
      if (
        path === "/review-record/comments/comment-b/resolve" &&
        method === "POST"
      ) {
        return new Promise<ReviewRecordResponse>((resolve, reject) => {
          resolveResolvers.push(resolve);
          resolveRejecters.push(reject);
        });
      }
      throw new Error(`Unexpected desktop request: ${method ?? "GET"} ${path}`);
    });
  });

  afterEach(() => {
    const fallback = recordWith([existingComment]);
    for (const resolve of createResolvers.splice(0)) resolve(fallback);
    for (const resolve of resolveResolvers.splice(0)) resolve(fallback);
    resolveRejecters = [];
    act(() => root.unmount());
    host.remove();
    desktopQueryClient.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("does not let an older durable response overwrite a newer comment mutation", async () => {
    ({ host, root } = mountPage());
    await flush();
    if (!host) throw new Error("Review page host is missing.");

    act(() => buttonByText(host, "+ File note").click());
    await flush();
    const draft = host.querySelector<HTMLTextAreaElement>(
      "#review-comment-draft",
    );
    if (!draft) throw new Error("Review note editor missing.");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(draft, "Created note");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => buttonByText(host, "Save note").click());
    await flush();
    expect(createResolvers).toHaveLength(1);
    if (!createdComment) throw new Error("Create request was not captured.");

    act(() => buttonByText(host, "Resolve").click());

    const createResolver = createResolvers.shift();
    if (!createResolver) throw new Error("Missing create response.");
    // This older create snapshot still has the pre-resolution state for B.
    await settle(createResolver, recordWith([existingComment, createdComment]));
    await flush();

    const rejectResolve = resolveRejecters.shift();
    if (!rejectResolve) throw new Error("Missing resolve request.");
    await act(async () => {
      rejectResolve(new Error("Resolve request failed."));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const existingNote = [...host.querySelectorAll<HTMLElement>("li")].find(
      (item) => item.textContent?.includes("Existing note"),
    );
    expect(existingNote?.textContent).toContain("resolved");
    expect(host.textContent).toContain("Created note");
  });
});
