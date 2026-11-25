// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChangeFileList } from "../../apps/desktop/src/renderer/thread-workbench/ChangeFileList";
import { TerminalPanel } from "../../apps/desktop/src/renderer/thread-workbench/ChangesAndTerminalPanels";
import { workbenchPanelMeta } from "../../apps/desktop/src/renderer/thread-workbench/models";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  vi.restoreAllMocks();
});

it("opens the exact changed path from the inspector without altering staged state", () => {
  const onSelect = vi.fn();
  const path = "src/ui/new panel.tsx";
  act(() => {
    root.render(
      <ChangeFileList
        changes={[
          {
            path,
            status: "MM",
            staged: true,
            unstaged: true,
            untracked: false,
          },
        ]}
        currentPath={path}
        onSelect={onSelect}
      />,
    );
  });
  const file = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${path}"]`,
  );
  expect(file?.getAttribute("aria-current")).toBe("true");
  expect(file?.title).toContain("Staged and unstaged");
  act(() => file?.click());
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(path);
});

it("leaves the changed-file count to the file list header", () => {
  expect(
    workbenchPanelMeta("changes", {
      approvals: 0,
      commands: 0,
      files: 0,
      plans: 0,
      preview: "",
      settings: 0,
      tasks: 0,
    }),
  ).toBe("");
});

it("copies the exact recorded terminal output and does not replay the command", async () => {
  const command = {
    id: "build",
    command: "bun run build",
    exitCode: 0,
    streamOutput: "output\twith spaces\n\n",
  };
  const writeText = vi.fn().mockResolvedValue(undefined);
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  try {
    const insert = vi.fn();
    const reload = vi.fn();
    const setSelectedCommand = vi.fn();
    act(() => {
      root.render(
        <TerminalPanel
          controller={{
            terminal: {
              loading: false,
              status: "ready",
              isValidating: false,
              hasData: true,
              error: "",
              errorDetail: "",
              data: { commands: [command] },
              reload,
            },
            commandEntries: [command],
            currentCommand: command,
            setSelectedCommand,
            insert,
          }}
        />,
      );
    });
    expect(host.textContent).toContain("Exit 0");
    expect(
      host.querySelector('[aria-label="Command output"] pre')?.textContent,
    ).toBe(command.streamOutput);
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Copy command output"]',
        )
        ?.click();
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(command.streamOutput);
    expect(insert).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(setSelectedCommand).not.toHaveBeenCalled();
  } finally {
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
