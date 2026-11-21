// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RunReceipt } from "../../apps/desktop/src/renderer/chat/models";
import {
  formatRunElapsed,
  RunReceiptView,
  runActivityItems,
} from "../../apps/desktop/src/renderer/chat/RunReceiptView";
import type { ToolActivity } from "../../apps/desktop/src/renderer/components/message-output";
import { ToolActivityGroup } from "../../apps/desktop/src/renderer/components/ToolActivityGroup";
import { toolActivityDetails } from "../../apps/desktop/src/renderer/components/tool-activity-details";
import type { DesktopRunUpdate } from "../../apps/desktop/src/shared/contracts";

const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const writeText = vi.fn<(value: string) => Promise<void>>();

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

function button(name: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll("button")).find(
    (element) =>
      (element.getAttribute("aria-label") ?? element.textContent) === name,
  );
  if (!result) throw new Error(`Missing ${name} button`);
  return result;
}

const startedAt = "2026-11-20T00:00:00Z";

function step(
  type: DesktopRunUpdate["type"],
  observedActionCount: number,
  ms: number,
  extra: Partial<DesktopRunUpdate["run"]> = {},
): DesktopRunUpdate {
  return {
    type,
    sessionId: "session",
    run: {
      runId: "run",
      sessionId: "session",
      roomId: "room",
      source: "desktop",
      message: "",
      runDepth: "standard",
      configuredMaxIterations: 4,
      observedActionCount,
      progressMode: "all",
      status: "acting",
      localMutations: [],
      pendingApprovals: 0,
      startedAt,
      updatedAt: new Date(Date.parse(startedAt) + ms).toISOString(),
      ...extra,
    },
  };
}

it("keeps the same activity row selected as a matched action returns", () => {
  const action = step("action-started", 1, 100, { activeAction: "WRITE_FILE" });
  const events = [action];
  const draw = (receipt: RunReceipt) =>
    act(() =>
      root.render(<RunReceiptView pending={false} receipt={receipt} />),
    );
  draw({ latest: action, events });
  const disclosure = host.querySelector<HTMLButtonElement>(
    'section[aria-label="Run receipt"] > button',
  );
  if (!disclosure) throw new Error("Missing run disclosure");
  act(() => disclosure.click());
  act(() => button("Show Writing file details").click());
  const returned = step("action-completed", 1, 225, {
    lastAction: "WRITE_FILE",
  });
  const receipt = { latest: returned, events: [...events, returned] };
  draw(receipt);
  expect(
    button("Hide Writing file details").getAttribute("aria-expanded"),
  ).toBe("true");
  expect(runActivityItems(receipt)).toMatchObject([
    { label: "Writing file", durationMs: 125 },
  ]);
  expect(host.textContent).toContain("Returned");
  expect(host.textContent).toContain("Duration125 ms");
  expect(formatRunElapsed(225)).toBe("225 ms");
});

it("avoids assigning timing to overlapping actions or reporting a missing result as returned", () => {
  const finished = step("completed", 2, 1000, { status: "complete" });
  const events = [
    step("action-started", 1, 25, { activeAction: "READ_FILE" }),
    step("action-started", 2, 50, { activeAction: "WRITE_FILE" }),
    step("action-completed", 2, 200, { lastAction: "WRITE_FILE" }),
    step("approvals", 2, 310, { pendingApprovals: 1 }),
    step("approvals", 2, 415, { pendingApprovals: 0 }),
  ];
  expect(runActivityItems({ latest: finished, events })).toMatchObject([
    { label: "Reading file", status: "unreported" },
    { label: "Writing file", status: "complete", durationMs: undefined },
    { label: "Approval requested", status: "waiting" },
    { label: "Approval queue cleared", status: "complete" },
  ]);
});

it("keeps overlapping named actions attached to their starts when the shared counter advances", () => {
  const events = [
    step("action-started", 1, 25, { activeAction: "READ_FILE" }),
    step("action-started", 2, 50, { activeAction: "WRITE_FILE" }),
    step("action-completed", 2, 125, { lastAction: "READ_FILE" }),
    step("action-completed", 2, 130, { lastAction: "READ_FILE" }),
    step("action-completed", 2, 200, { lastAction: "WRITE_FILE" }),
  ];
  const latest = step("completed", 2, 300, { status: "complete" });
  expect(runActivityItems({ latest, events })).toMatchObject([
    { id: "action:1:READ_FILE", status: "complete", durationMs: undefined },
    { id: "action:2:WRITE_FILE", status: "complete", durationMs: undefined },
  ]);
});

it("records an ambiguous same-name return separately from both possible invocations", () => {
  const events = [
    step("action-started", 1, 25, { activeAction: "READ_FILE" }),
    step("action-started", 2, 50, { activeAction: "READ_FILE" }),
    step("action-completed", 2, 125, { lastAction: "READ_FILE" }),
  ];
  const latest = step("completed", 2, 300, { status: "complete" });
  const items = runActivityItems({ latest, events });
  expect(items).toMatchObject([
    { id: "action:1:READ_FILE", status: "unreported" },
    { id: "action:2:READ_FILE", status: "unreported" },
    {
      id: "return:action:2:READ_FILE",
      detail: "Invocation unknown",
      status: "complete",
      durationMs: undefined,
    },
  ]);
  expect(items.every((item) => item.durationMs === undefined)).toBe(true);
});

it("shows structured exit metadata and copies the full selected output without formatting it", async () => {
  const stdout = `<script>literal text</script>\n${"line > value\n".repeat(3_500)}`;
  const command: ToolActivity = {
    id: "command",
    name: "TERMINAL_SHELL",
    status: "completed",
    input: { command: "npm test" },
    output: {
      data: {
        stdout,
        stderr: "failed assertion",
        exitCode: 2,
        durationMs: 125,
      },
    },
  };
  act(() =>
    root.render(<ToolActivityGroup pending={false} tools={[command]} />),
  );
  act(() => button("Tool activity").click());
  expect(button("Show Shell command details").textContent).toContain("Exit 2");
  expect(button("Show Shell command details").dataset.toolStatus).toBe("error");
  act(() => button("Show Shell command details").click());
  const payload = host.querySelector('section[aria-label="Standard output"]');
  expect(payload?.textContent).toBe(stdout.slice(0, 40_000));
  expect(host.querySelector("script")).toBeNull();
  expect(host.textContent).toContain("Preview · 40,000 characters");
  await act(async () => button("Copy output").click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith(stdout);
});

it("renders an explicit tool diff without modifying the captured patch", async () => {
  const diff = "--- a/index.ts\n+++ b/index.ts\n@@ -1 +1 @@\n-before\n+after\n";
  const edit: ToolActivity = {
    id: "patch",
    name: "PATCH_FILE",
    status: "completed",
    input: { path: "index.ts" },
    output: { data: { diff, durationMs: 2_120 } },
  };
  expect(toolActivityDetails(edit)).toMatchObject({
    target: "index.ts",
    duration: "2.1 s",
    diff,
  });
  act(() => root.render(<ToolActivityGroup pending={true} tools={[edit]} />));
  act(() => button("Show Editing file details").click());
  expect(host.querySelector('[data-diff-line="removed"]')?.textContent).toBe(
    "-before\n",
  );
  expect(host.querySelector('[data-diff-line="added"]')?.textContent).toBe(
    "+after\n",
  );
  await act(async () => button("Copy diff").click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith(diff);
});
