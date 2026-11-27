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

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const workspacePath = "/workspace/review-polling";
const origin = {
  botId: "bot-1",
  originConversationId: "chat-1",
  workspacePath,
};
const now = "2026-02-20T12:00:00.000Z";
const reviewRecord = {
  scope: {
    repositoryRoot: workspacePath,
    branch: "review-branch",
    head: "abc123",
  },
  comments: [],
  events: [],
  updatedAt: now,
};

function reviewResponse(checkStatus: "in_progress" | "completed") {
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
      checks: [
        {
          name: "typecheck",
          status: checkStatus,
          ...(checkStatus === "completed" ? { conclusion: "success" } : {}),
        },
      ],
      workflowRuns: [],
      fetchedAt: now,
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

async function flushRequests() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function getCount(path: string): number {
  return vi
    .mocked(desktopRequest)
    .mock.calls.filter(
      ([requestPath, method]) => requestPath === path && method === "GET",
    ).length;
}

describe("review page polling", () => {
  let root: Root;
  let host: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.stubGlobal("doolittle", {
      platform: "darwin",
      mutateRepository: vi.fn(),
    });
    window.localStorage.clear();
    vi.mocked(desktopRequest).mockImplementation(async (path) => {
      if (path === "/execution/approvals") return { approvals: [] };
      if (path === "/codegen/runs") return { runs: [] };
      if (path === "/repo/review") return reviewResponse("in_progress");
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
      if (path === "/review-record?limit=80") return { record: reviewRecord };
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
      throw new Error(`Unexpected desktop request: ${path}`);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    desktopQueryClient.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("refreshes approvals, agent runs, checks, files, and the review record while visible", async () => {
    ({ host, root } = mountPage());
    await flushRequests();

    const paths = [
      "/execution/approvals",
      "/codegen/runs",
      "/repo/review",
      "/repo/changes",
      "/review-record?limit=80",
    ];
    const initialCounts = new Map(paths.map((path) => [path, getCount(path)]));
    for (const [path, count] of initialCounts) {
      expect(count, `${path} initial read`).toBeGreaterThan(0);
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await flushRequests();

    for (const [path, count] of initialCounts) {
      expect(getCount(path), `${path} polled read`).toBeGreaterThan(count);
    }
  });
});
