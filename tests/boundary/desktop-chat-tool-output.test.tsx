// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RunReceipt } from "../../apps/desktop/src/renderer/chat/models";
import { RunReceiptView } from "../../apps/desktop/src/renderer/chat/RunReceiptView";
import {
  formatRunElapsed,
  liveRunActivity,
  runActivityItems,
} from "../../apps/desktop/src/renderer/chat/run-activity";
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
  const action = {
    ...step("action-started", 1, 100, { activeAction: "WRITE_FILE" }),
    activity: {
      action: "WRITE_FILE",
      phase: "running" as const,
      paths: ["/approved/src/config.ts"],
    },
  };
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
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
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

it("shows actual delegated progress and keeps inspected output open when another same-kind tool returns", async () => {
  const workspace = "/private/temporary/workspace";
  const activity = {
    id: "worker:tool:one",
    action: "TASKS_SPAWN_AGENT",
    origin: "delegated" as const,
    kind: "execute",
    phase: "running" as const,
    command: "nub run test:scope",
    directory: workspace,
  };
  const running = {
    ...step("action-progress", 1, 100, {
      activeAction: "TASKS_SPAWN_AGENT",
      lastMeaningfulActivityAt: new Date().toISOString(),
    }),
    activity,
  };
  const peer = {
    ...step("action-progress", 1, 200, {
      activeAction: "TASKS_SPAWN_AGENT",
      lastMeaningfulActivityAt: new Date().toISOString(),
    }),
    activity: {
      ...activity,
      id: "worker:tool:two",
      command: undefined,
      directory: undefined,
    },
  };
  act(() =>
    root.render(
      <RunReceiptView
        pending
        receipt={{ latest: peer, events: [running, peer] }}
      />,
    ),
  );
  const disclosure = button("Shell command");
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  expect(host.querySelector('[aria-label="Run steps"]')).toBeNull();
  act(() => disclosure.click());
  const runningRow = button("Show Shell command details");
  expect(runningRow.textContent).toContain("nub run test:scope");
  expect(
    host.querySelectorAll('[data-step-status="running"] > button'),
  ).toHaveLength(1);
  const detailsId = runningRow.getAttribute("aria-controls");
  runningRow.focus();
  act(() => runningRow.click());
  expect(host.textContent).toContain(workspace);

  const returned = {
    ...step("action-progress", 1, 400, {
      activeAction: "TASKS_SPAWN_AGENT",
      lastMeaningfulActivityAt: new Date().toISOString(),
    }),
    activity: {
      id: activity.id,
      action: activity.action,
      origin: activity.origin,
      phase: "failed" as const,
      summary: "One check failed.",
      output: "assertion failed",
      exitCode: 1,
      durationMs: 300,
    },
  };
  act(() =>
    root.render(
      <RunReceiptView
        pending
        receipt={{
          latest: returned,
          events: [running, peer, returned, running],
        }}
      />,
    ),
  );
  const openRow = button("Hide Shell command details");
  expect(openRow).toBe(runningRow);
  expect(document.activeElement).toBe(openRow);
  expect(openRow.getAttribute("aria-controls")).toBe(detailsId);
  expect(openRow.textContent).toContain("Exit 1");
  expect(host.textContent).toContain("One check failed.");
  expect(host.textContent).toContain("assertion failed");
  await act(async () => button("Copy output").click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith("assertion failed");
});

it("announces queued progress without adding clickable empty rows", () => {
  const queued = step("waiting", 0, 100, {
    status: "waiting",
    statusDetail: "Waiting for execution capacity",
    lastMeaningfulActivityAt: new Date().toISOString(),
  });
  act(() =>
    root.render(
      <RunReceiptView
        pending
        progress="Waiting for an execution slot."
        receipt={{ latest: queued, events: [queued] }}
      />,
    ),
  );
  const status = host.querySelector('[role="status"]');
  expect(status?.textContent).toContain("Queued");
  expect(status?.textContent).toContain("Waiting for an execution slot.");
  expect(host.querySelector('[aria-label="Run steps"]')).toBeNull();
});

it("summarizes current tool activity and elapsed time from live receipt evidence", () => {
  const startedAtMs = Date.parse(startedAt);
  const shell = {
    ...step("action-started", 1, 8_000, { activeAction: "TERMINAL_SHELL" }),
    activity: {
      action: "TERMINAL_SHELL",
      phase: "running" as const,
      command: "nub run test:scope",
    },
  };
  const read = {
    ...step("action-started", 2, 12_000, { activeAction: "READ_FILE" }),
    activity: {
      action: "READ_FILE",
      phase: "running" as const,
      paths: ["/repo/notes.ts"],
    },
  };

  expect(
    liveRunActivity({ latest: shell, events: [shell] }, startedAtMs + 65_000),
  ).toEqual({
    label: "Running shell command",
    detail: "nub run test:scope",
    elapsedMs: 65_000,
  });
  expect(
    liveRunActivity({ latest: read, events: [read] }, startedAtMs + 12_000),
  ).toMatchObject({
    label: "Reading file",
    detail: "notes.ts",
  });
});

it("uses current run facts without inventing granular activity", () => {
  const startedAtMs = Date.parse(startedAt);
  const search = step("stream", 1, 20_000, {
    activeAction: "SEARCH_FILES",
    activeStream: "action",
    status: "acting",
  });
  const thinking = step("thinking", 0, 2_000, { status: "thinking" });
  const acting = step("acting", 0, 3_000, { status: "acting" });
  const complete = step("completed", 1, 30_000, { status: "complete" });

  expect(
    liveRunActivity({ latest: search, events: [] }, startedAtMs + 20_000),
  ).toMatchObject({
    label: "Searching files",
  });
  expect(
    liveRunActivity({ latest: thinking, events: [] }, startedAtMs + 2_000),
  ).toMatchObject({ label: "Thinking", elapsedMs: 2_000 });
  expect(
    liveRunActivity({ latest: acting, events: [] }, startedAtMs + 3_000),
  ).toEqual({ detail: "", elapsedMs: 3_000 });
  expect(
    liveRunActivity({ latest: complete, events: [] }, startedAtMs + 30_000),
  ).toBeNull();
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

it("retains distinct same-name tool results when the SDK omits invocation IDs", () => {
  const returned = (path: string) => ({
    ...step("action-completed", 2, 125, { lastAction: "READ_FILE" }),
    activity: {
      action: "READ_FILE",
      phase: "completed" as const,
      paths: [path],
    },
  });
  const first = returned("first.ts");
  const second = returned("second.ts");
  const latest = step("completed", 2, 300, { status: "complete" });
  const items = runActivityItems({
    latest,
    events: [
      step("action-started", 1, 25, { activeAction: "READ_FILE" }),
      step("action-started", 2, 50, { activeAction: "READ_FILE" }),
      first,
      second,
      first,
    ],
  });
  expect(items.slice(2).map((item) => item.activity?.paths)).toEqual([
    ["first.ts"],
    ["second.ts"],
  ]);
  expect(new Set(items.map((item) => item.id)).size).toBe(4);
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

it("recovers shell streams from an ActionResult text blob", async () => {
  const command: ToolActivity = {
    id: "shell-text",
    name: "TERMINAL_SHELL",
    status: "completed",
    input: { command: "pnpm install" },
    output: {
      success: true,
      text: [
        "Command: cd /path && pnpm install",
        "Exit code: 0",
        "Timed out: no",
        "STDOUT:",
        "added 42 packages",
        "STDERR:",
        "warning: deprecated catalog",
      ].join("\n"),
    },
  };
  expect(toolActivityDetails(command)).toMatchObject({
    command: "pnpm install",
    exitCode: 0,
    stdout: "added 42 packages",
    stderr: "warning: deprecated catalog",
    timedOut: false,
    status: "completed",
  });
  act(() =>
    root.render(<ToolActivityGroup pending={false} tools={[command]} />),
  );
  act(() => button("Tool activity").click());
  act(() => button("Show Shell command details").click());
  expect(
    host.querySelector('section[aria-label="Standard output"]')?.textContent,
  ).toBe("added 42 packages");
  expect(
    host.querySelector('section[aria-label="Standard error"]')?.textContent,
  ).toBe("warning: deprecated catalog");
  await act(async () => button("Copy output").click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith("added 42 packages");
});

it("surfaces timeout metadata and incomplete output from the text blob", () => {
  const command: ToolActivity = {
    id: "shell-timeout",
    name: "TERMINAL_SHELL",
    status: "completed",
    input: { command: "pnpm install" },
    output: {
      success: true,
      text: [
        "Command: cd /path && pnpm install",
        "Exit code: 124",
        "Timed out: yes (30000 ms limit); output below is incomplete",
        "STDOUT:",
        "partial install logs",
        "STDERR:",
        "",
      ].join("\n"),
    },
  };
  expect(toolActivityDetails(command)).toMatchObject({
    exitCode: 124,
    timedOut: true,
    duration: "30 s",
    stdout: "partial install logs",
    truncated: true,
    status: "error",
  });
  act(() =>
    root.render(<ToolActivityGroup pending={false} tools={[command]} />),
  );
  act(() => button("Tool activity").click());
  const row = button("Show Shell command details");
  expect(row.textContent).toContain("Exit 124");
  expect(row.dataset.toolStatus).toBe("error");
  act(() => row.click());
  expect(host.textContent).toContain("Command timed out.");
  expect(
    host.querySelector('section[aria-label="Standard output"]')?.textContent,
  ).toBe("partial install logs");
});

it("tail-bounds captured stream text and marks it truncated", () => {
  const command: ToolActivity = {
    id: "shell-huge",
    name: "TERMINAL_SHELL",
    status: "completed",
    input: { command: "build" },
    output: {
      success: true,
      text: `Command: build\nExit code: 0\nSTDOUT:\nhead ${"x".repeat(
        10_000,
      )} TAIL\nSTDERR:\n`,
    },
  };
  const details = toolActivityDetails(command);
  expect(details.truncated).toBe(true);
  expect(details.stdout?.startsWith("… (truncated)\n")).toBe(true);
  expect(details.stdout?.endsWith(" TAIL")).toBe(true);
  expect(details.stdout?.includes("head")).toBe(false);
  expect(details.stdout?.length).toBeLessThan(8_300);
});

it("shows result text and file paths for non-shell actions", () => {
  const read: ToolActivity = {
    id: "read",
    name: "READ_FILE",
    status: "completed",
    input: { path: "src/index.ts" },
    output: { success: true, text: "export const value = 1;\n" },
  };
  const write: ToolActivity = {
    id: "write",
    name: "WRITE_FILE",
    status: "completed",
    output: { data: { path: "src/created.ts" }, success: true },
  };
  expect(toolActivityDetails(read)).toMatchObject({
    target: "src/index.ts",
    output: "export const value = 1;\n",
  });
  expect(toolActivityDetails(write)).toMatchObject({
    target: "src/created.ts",
  });
  act(() => root.render(<ToolActivityGroup pending={false} tools={[read]} />));
  act(() => button("Tool activity").click());
  act(() => button("Show Reading file details").click());
  expect(host.querySelector('section[aria-label="Result"]')?.textContent).toBe(
    "export const value = 1;\n",
  );
});

it("renders an error block for failed actions carrying a text blob", () => {
  const failure: ToolActivity = {
    id: "failed",
    name: "WRITE_FILE",
    status: "error",
    error: "Write failed.",
    output: {
      success: false,
      text: "Error: permission denied\n  at writeFile (fs.ts:12)",
    },
  };
  const details = toolActivityDetails(failure);
  expect(details.status).toBe("error");
  expect(details.error).toContain("permission denied");
  act(() =>
    root.render(<ToolActivityGroup pending={false} tools={[failure]} />),
  );
  act(() => button("Tool activity").click());
  act(() => button("Show Writing file details").click());
  expect(host.textContent).toContain("Write failed.");
  expect(
    host.querySelector('section[aria-label="Error"]')?.textContent,
  ).toContain("permission denied");
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
  const disclosure = button("Tool activity");
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  act(() => disclosure.click());
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

it("prefers the explicitly user-authored text over machine payload text", () => {
  const payload = JSON.stringify({
    results: [
      {
        title: "Example",
        url: "https://example.com",
        excerpts: ["A result excerpt."],
      },
    ],
  });
  const authored =
    "### Web results for “example”\n\n1. [Example](https://example.com)\n   A result excerpt.";
  const search: ToolActivity = {
    id: "search-user-facing",
    name: "WEB_SEARCH",
    status: "completed",
    input: { query: "example" },
    output: { success: true, text: payload, userFacingText: authored },
  };
  expect(toolActivityDetails(search)).toMatchObject({ output: authored });
  act(() =>
    root.render(<ToolActivityGroup pending={false} tools={[search]} />),
  );
  act(() => button("Tool activity").click());
  act(() => button("Show Web search details").click());
  // The displayed result carries the authored prose, never the machine JSON.
  // (Whether the prose renders as markdown or preformatted text belongs to
  // the markdown-pipeline coverage; both presentations satisfy this.)
  const result = host.querySelector('section[aria-label="Result"]');
  expect(result?.textContent).toContain("Web results for “example”");
  expect(result?.textContent).not.toContain('"results"');
  expect(result?.textContent).not.toContain("excerpts");
  // The machine payload stays available as structured evidence: the sources
  // list is still recovered from the JSON text, and the full envelope remains
  // under the raw disclosure.
  expect(
    host
      .querySelector('section[aria-label="Sources"]')
      ?.querySelector<HTMLAnchorElement>('a[href="https://example.com"]')
      ?.textContent,
  ).toContain("Example");
  expect(host.textContent).toContain("Full result");
});

it("keeps diagnostic text in the error block when a failure authors user-facing prose", () => {
  const failure: ToolActivity = {
    id: "failed-prose",
    name: "WRITE_FILE",
    status: "error",
    error: "Write failed.",
    output: {
      success: false,
      text: "Error: permission denied\n  at writeFile (fs.ts:12)",
      userFacingText: "I couldn't write the file because access was denied.",
    },
  };
  const details = toolActivityDetails(failure);
  expect(details.error).toContain("permission denied");
  expect(details.error).not.toContain("I couldn't write the file");
  expect(details.output).toBeUndefined();
});
