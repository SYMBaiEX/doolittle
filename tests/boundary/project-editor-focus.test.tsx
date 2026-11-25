// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ProjectManager } from "../../apps/desktop/src/renderer/components/ProjectManager";

const noop = () => {};
const settleFocus = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it("isolates project manager content while the nested editor is open", async () => {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ProjectManager
          activeScope="all"
          isOpen
          onClose={noop}
          onCreateProject={noop}
          onScopeChange={noop}
          projects={[{ id: "alpha", name: "Alpha" }]}
        />,
      ),
    );
    const newButton = [...host.querySelectorAll("button")].find(
      (entry) => entry.textContent === "New",
    );
    expect(newButton).toBeDefined();
    await act(async () => {
      newButton?.focus();
      newButton?.click();
      await settleFocus();
    });

    const manager = host.querySelector<HTMLElement>(".project-manager");
    const header = host.querySelector<HTMLElement>(".project-manager__header");
    const toolbar = host.querySelector<HTMLElement>(
      ".project-manager__toolbar",
    );
    const body = host.querySelector<HTMLElement>(".project-manager__body");
    const editorBackdrop = host.querySelector<HTMLElement>(
      ".project-editor-backdrop",
    );
    expect(manager?.hasAttribute("aria-hidden")).toBe(false);
    expect(manager?.inert).not.toBe(true);
    expect(editorBackdrop?.hasAttribute("aria-hidden")).toBe(false);
    for (const element of [header, toolbar, body]) {
      expect(element?.getAttribute("aria-hidden")).toBe("true");
      expect(element?.inert).toBe(true);
    }
    const nameInput = host.querySelector<HTMLInputElement>(
      'input[placeholder="e.g. Doolittle Desktop"]',
    );
    expect(nameInput?.closest("form")?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(nameInput);

    await act(async () => {
      nameInput?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      );
      await settleFocus();
    });

    expect(host.querySelector(".project-editor-backdrop")).toBeNull();
    for (const element of [header, toolbar, body]) {
      expect(element?.hasAttribute("aria-hidden")).toBe(false);
    }
    expect(document.activeElement).toBe(newButton);
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
