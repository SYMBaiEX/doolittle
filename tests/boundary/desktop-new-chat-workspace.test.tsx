// @vitest-environment jsdom
import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NewChatChooser } from "../../apps/desktop/src/renderer/bots/NewChatChooser";

it("chooses a local workspace before starting a chat with the pinned bot", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onConfirm = vi.fn();
  const onScopeChange = vi.fn();
  const onChooseLocalFolder = vi.fn();
  const bot: BotSummary = {
    id: "fixture",
    agentId: "fixture",
    name: "Fixture",
    persona: "",
    model: { provider: "offline", model: "offline" },
    permissions: {
      connectionIds: [],
      toolIds: [],
      workspacePaths: [],
      allowMutation: true,
      allowDelegation: false,
    },
    workspacePath: "/fixture/private",
    isDefault: true,
    state: "ready",
    activeRunCount: 0,
    createdAt: "",
    updatedAt: "",
  };
  const render = (scope: string) =>
    act(() =>
      root.render(
        <NewChatChooser
          bot={bot}
          onChooseLocalFolder={onChooseLocalFolder}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          onScopeChange={onScopeChange}
          projects={[
            { id: "project", name: "Project", primaryPath: "/fixture/project" },
            { id: "missing", name: "No folder" },
            {
              id: "old",
              name: "Archived",
              primaryPath: "/fixture/old",
              archived: true,
            },
          ]}
          scope={scope}
        />,
      ),
    );

  try {
    render("unscoped");
    const selector = host.querySelector<HTMLSelectElement>("select");
    const botButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Start chat with Fixture"]',
    );
    const folderButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Choose local folder"),
    );
    if (!selector || !botButton || !folderButton)
      throw new Error("New chat actions were not rendered.");
    expect(host.querySelector("h2")?.textContent).toBe(
      "Start a chat with Fixture",
    );
    expect(selector.selectedOptions[0].text).toBe("Private workspace");
    expect(Array.from(selector.options, (option) => option.value)).toEqual([
      "unscoped",
      "project",
    ]);
    expect(selector.querySelector("optgroup")?.label).toBe("This computer");

    act(() => folderButton.click());
    expect(onChooseLocalFolder).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => {
      selector.value = "project";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onScopeChange).toHaveBeenCalledExactlyOnceWith("project");
    render("project");
    expect(host.textContent).toContain("This computer · /fixture/project");
    act(() => botButton.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);

    render("old");
    expect(selector.selectedOptions[0].text).toBe("Project unavailable");
    expect(botButton.disabled).toBe(true);
  } finally {
    act(() => root.unmount());
    host.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
