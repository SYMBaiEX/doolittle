// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotCreationDialog } from "./BotCreationDialog";

vi.mock("../lib", () => ({
  desktopRequest: vi.fn(() => Promise.resolve({ providers: {} })),
  errorMessage: vi.fn(() => "Request failed"),
}));

describe("BotCreationDialog accessibility", () => {
  let host: HTMLDivElement;
  let root: Root;
  let trigger: HTMLButtonElement;
  let raf: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    host = document.createElement("div");
    trigger = document.createElement("button");
    document.body.append(trigger, host);
    root = createRoot(host);
    raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    trigger.focus();
  });

  afterEach(() => {
    act(() => root.unmount());
    raf.mockRestore();
    trigger.remove();
    host.remove();
  });

  it("focuses the name field and associates validation with the invalid input", async () => {
    await act(async () => {
      root.render(
        <BotCreationDialog
          onClose={vi.fn()}
          onCreated={vi.fn()}
          returnFocusTarget={trigger}
          runtime={null}
          workspacePath="/workspace"
        />,
      );
    });
    const name = host.querySelector<HTMLInputElement>("#bot-create-name");
    expect(document.activeElement).toBe(name);
    const continueButton = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Continue"),
    );
    await act(async () => continueButton?.click());
    expect(name?.getAttribute("aria-invalid")).toBe("true");
    const descriptionId = name?.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(host.querySelector(`#${descriptionId}`)?.textContent).toBe(
      "Give this bot a name.",
    );
    expect(document.activeElement).toBe(name);
  });

  it("restores focus to the launch control when the dialog unmounts", async () => {
    await act(async () => {
      root.render(
        <BotCreationDialog
          onClose={vi.fn()}
          onCreated={vi.fn()}
          returnFocusTarget={trigger}
          runtime={null}
          workspacePath="/workspace"
        />,
      );
    });
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(trigger);
  });
});
