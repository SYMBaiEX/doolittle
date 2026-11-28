// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ReviewPatch,
  type ReviewPatchMutation,
} from "../../apps/desktop/src/renderer/review/ReviewPatch";

const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
});

const multiFilePatch = [
  "diff --git a/src/alpha.ts b/src/alpha.ts",
  "index 1111111..2222222 100644",
  "--- a/src/alpha.ts",
  "+++ b/src/alpha.ts",
  "@@ -10,2 +10,3 @@ export function alpha",
  " keep",
  "-old",
  "+new",
  "+another",
  "diff --git a/docs/file name.md b/docs/file name.md",
  "--- a/docs/file name.md",
  "+++ b/docs/file name.md",
  "@@ -3 +3 @@",
  "-before",
  "+after",
].join("\n");

function renderPatch(
  patch = multiFilePatch,
  truncated = false,
  options: {
    staged?: boolean;
    mutationError?: string;
    onPatchMutation?: (mutation: ReviewPatchMutation) => void;
  } = {},
) {
  const onStartComment = vi.fn();
  act(() =>
    root.render(
      <ReviewPatch
        mutationError={options.mutationError}
        onPatchMutation={options.onPatchMutation}
        onStartComment={onStartComment}
        patch={patch}
        path="src/alpha.ts"
        selectedPathComments={[]}
        staged={options.staged}
        truncated={truncated}
      />,
    ),
  );
  return onStartComment;
}

it("renders file sections, separated hunks, and old/new line numbers", () => {
  renderPatch();

  const files = host.querySelectorAll("[data-patch-file]");
  expect(files).toHaveLength(2);
  expect(files[0]?.textContent).toContain("src/alpha.ts");
  expect(files[1]?.textContent).toContain("docs/file name.md");
  expect(host.querySelectorAll("[data-patch-hunk]")).toHaveLength(2);
  expect(host.textContent).toContain("@@ -10,2 +10,3 @@ export function alpha");

  const context = host.querySelector('[data-kind="context"]');
  const deletion = host.querySelector('[data-kind="deletion"]');
  const addition = host.querySelector('[data-kind="addition"]');
  expect(
    [...(context?.querySelectorAll(".review-patch-number") ?? [])].map(
      (cell) => cell.textContent,
    ),
  ).toEqual(["10", "10"]);
  expect(
    [...(deletion?.querySelectorAll(".review-patch-number") ?? [])].map(
      (cell) => cell.textContent,
    ),
  ).toEqual(["11", ""]);
  expect(
    [...(addition?.querySelectorAll(".review-patch-number") ?? [])].map(
      (cell) => cell.textContent,
    ),
  ).toEqual(["", "11"]);
});

it("keeps line-specific review note anchors on the structured rows", () => {
  const onStartComment = renderPatch();
  const button = host.querySelector<HTMLButtonElement>(
    '[aria-label="Add review note on old line 11"]',
  );

  act(() => button?.click());

  expect(onStartComment).toHaveBeenCalledExactlyOnceWith("src/alpha.ts", {
    side: "old",
    line: 11,
    preview: "old",
  });
});

it("shows metadata-only content and marks truncated patches as partial", () => {
  renderPatch(
    [
      "diff --git a/image.png b/image.png",
      "index 1111111..2222222 100644",
      "Binary files a/image.png and b/image.png differ",
    ].join("\n"),
    true,
  );

  expect(host.textContent).toContain("Partial patch");
  expect(host.textContent).toContain(
    "Binary files a/image.png and b/image.png differ",
  );
  expect(host.querySelector("[data-patch-file]")?.textContent).toContain(
    "image.png",
  );
});

it("emits a reduced unified patch when accepting one hunk", () => {
  const onPatchMutation = vi.fn();
  renderPatch(multiFilePatch, false, { onPatchMutation });
  const button = host.querySelector<HTMLButtonElement>(
    '[aria-label="Accept hunk at old line 10"]',
  );

  act(() => button?.click());

  expect(onPatchMutation).toHaveBeenCalledExactlyOnceWith({
    type: "stage-hunk",
    label: "Hunk at old line 10",
    patch: `${[
      "diff --git a/src/alpha.ts b/src/alpha.ts",
      "index 1111111..2222222 100644",
      "--- a/src/alpha.ts",
      "+++ b/src/alpha.ts",
      "@@ -10,2 +10,3 @@ export function alpha",
      " keep",
      "-old",
      "+new",
      "+another",
    ].join("\n")}\n`,
  });
});

it("emits discard and unstage mutations for the working and staged patch states", () => {
  const onPatchMutation = vi.fn();
  renderPatch(multiFilePatch, false, { onPatchMutation });
  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Reject hunk at old line 10"]',
      )
      ?.click(),
  );
  expect(onPatchMutation).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: "discard-hunk" }),
  );

  onPatchMutation.mockClear();
  renderPatch(multiFilePatch, false, { onPatchMutation, staged: true });
  const unstage = host.querySelector<HTMLButtonElement>(
    '[aria-label="Reject staged hunk at old line 10"]',
  );
  expect(unstage?.textContent).toBe("Unstage");
  act(() => unstage?.click());
  expect(onPatchMutation).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ type: "unstage-hunk" }),
  );
});

it("hides hunk decisions for truncated or unsupported file patches", () => {
  const onPatchMutation = vi.fn();
  renderPatch(multiFilePatch, true, { onPatchMutation });

  expect(host.querySelector('[aria-label^="Accept hunk"]')).toBeNull();
  expect(host.textContent).toContain(
    "Hunk decisions are disabled for partial patches.",
  );

  renderPatch(
    [
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1 @@",
      "+created",
    ].join("\n"),
    false,
    { onPatchMutation },
  );
  expect(host.querySelector('[aria-label^="Accept hunk"]')).toBeNull();
  expect(host.textContent).toContain(
    "Hunk decisions are unavailable for this file format.",
  );
});

it("renders hunk application failure inline without hiding the patch", () => {
  renderPatch(multiFilePatch, false, {
    mutationError:
      "Hunk at old line 10 did not apply cleanly. patch does not apply",
    onPatchMutation: vi.fn(),
  });

  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "did not apply cleanly",
  );
  expect(host.querySelectorAll("[data-patch-hunk]")).toHaveLength(2);
});
