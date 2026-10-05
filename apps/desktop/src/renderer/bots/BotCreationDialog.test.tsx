// @vitest-environment jsdom

import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopRequest } from "../lib";
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
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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

  it("edits a stopped bot in place without discarding existing permissions", async () => {
    const bot = {
      id: "specialist",
      name: "Researcher",
      persona: "Research carefully",
      state: "stopped",
      model: { provider: "offline", model: "test", reasoningEffort: "high" },
      workspacePath: "/tmp/one",
      projectId: "original-project",
      permissions: {
        connectionIds: ["offline:local"],
        workspacePaths: ["/tmp/one", "/tmp/two"],
        toolIds: ["approved-tool"],
        allowMutation: false,
        allowDelegation: true,
      },
    } as BotSummary;
    const saved = vi.fn();
    await act(async () =>
      root.render(
        <BotCreationDialog
          editingBot={bot}
          onClose={vi.fn()}
          onCreated={saved}
          returnFocusTarget={trigger}
          runtime={null}
          workspacePath="/tmp/global"
          projectId="new-ambient-project"
        />,
      ),
    );
    expect(
      host.querySelector<HTMLInputElement>("#bot-create-name")?.value,
    ).toBe("Researcher");
    for (let index = 0; index < 4; index++)
      await act(async () =>
        [...host.querySelectorAll("button")]
          .find((entry) => entry.textContent === "Continue")
          ?.click(),
      );
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((entry) => entry.textContent === "Save bot")
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith(
      "/bots/specialist",
      "PATCH",
      expect.objectContaining({
        model: bot.model,
        permissions: {
          ...bot.permissions,
          workspacePaths: expect.arrayContaining(
            bot.permissions.workspacePaths,
          ),
        },
        workspacePath: "/tmp/one",
        projectId: "original-project",
      }),
    );
    expect(saved).toHaveBeenCalledOnce();
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
