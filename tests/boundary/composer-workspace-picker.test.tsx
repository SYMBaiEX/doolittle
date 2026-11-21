// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  type ChatWorkspaceTarget,
  ComposerProjectSelector,
} from "../../apps/desktop/src/renderer/composer-selectors/ComposerProjectSelector";

function workspacePicker() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const chooseFolder = vi.fn();
  const select = vi.fn();
  return {
    chooseFolder,
    select,
    render(target: ChatWorkspaceTarget) {
      return act(async () => {
        root.render(
          <ComposerProjectSelector
            target={target}
            onChooseRepository={chooseFolder}
            onManageProjects={vi.fn()}
            onSelectProject={select}
            projects={[
              { id: "project", name: "Coding", primaryPath: "/saved/coding" },
              { id: "notes", name: "Project without a folder" },
              {
                id: "old",
                name: "Archived",
                primaryPath: "/old",
                archived: true,
              },
            ]}
          />,
        );
      });
    },
    trigger() {
      const button = container.querySelector<HTMLButtonElement>(
        'button[aria-label^="Choose workspace."]',
      );
      if (!button) throw new Error("Expected the workspace picker.");
      return button;
    },
    dispose() {
      act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

function menuButton(text: string): HTMLButtonElement {
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.getAttribute("aria-label")).toBe(
    "Choose a workspace for a new chat",
  );
  const button = Array.from(
    dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find(
    (candidate) => candidate.querySelector("strong")?.textContent === text,
  );
  if (!button) throw new Error(`Missing workspace action: ${text}`);
  return button;
}

it("keeps a confirmed local root visible when the saved project moves", async () => {
  const picker = workspacePicker();
  try {
    await picker.render({
      kind: "local",
      projectId: "project",
      name: "Coding",
      path: "/original/coding",
    });
    expect(picker.trigger().getAttribute("aria-label")).toBe(
      "Choose workspace. Current workspace This computer · Coding.",
    );
    expect(
      picker.trigger().querySelector(".composer-route-label")?.textContent,
    ).toBe("Coding");
    expect(
      picker.trigger().querySelector(".composer-route-mode")?.textContent,
    ).toBe("Local");
    expect(picker.trigger().title).toBe("/original/coding");
    await act(async () => picker.trigger().click());
    expect(menuButton("Coding").title).toBe("/saved/coding");
    expect(menuButton("Coding").hasAttribute("aria-current")).toBe(false);
    expect(menuButton("Private workspace").hasAttribute("aria-current")).toBe(
      false,
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toMatch(
      /Project without a folder|Archived/u,
    );
    await act(async () => menuButton("Coding").click());
    expect(picker.select).toHaveBeenCalledWith("project");
  } finally {
    picker.dispose();
  }
});

it("offers the native folder chooser and an explicit private workspace", async () => {
  const picker = workspacePicker();
  try {
    await picker.render({ kind: "unconfirmed" });
    expect(picker.trigger().textContent).toBe("Workspace not confirmed");
    await act(async () => picker.trigger().click());
    expect(menuButton("Private workspace").hasAttribute("aria-current")).toBe(
      false,
    );
    await act(async () => menuButton("Choose local folder").click());
    expect(picker.chooseFolder).toHaveBeenCalledOnce();
    expect(picker.select).not.toHaveBeenCalled();

    await picker.render({ kind: "private" });
    await act(async () => picker.trigger().click());
    expect(menuButton("Private workspace").getAttribute("aria-current")).toBe(
      "true",
    );
    await act(async () => menuButton("Private workspace").click());
    expect(picker.select).toHaveBeenCalledWith("unscoped");
  } finally {
    picker.dispose();
  }
});
