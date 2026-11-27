// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProjectManager } from "../../apps/desktop/src/renderer/components/ProjectManager";

const noop = () => {};
const settleFocus = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("surfaces project creation failure inside the editor", async () => {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onCreateProject = vi.fn(async () => {
    throw new Error("Project store unavailable");
  });
  try {
    act(() =>
      root.render(
        <ProjectManager
          activeScope="all"
          isOpen
          onClose={noop}
          onCreateProject={onCreateProject}
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
      newButton?.click();
      await settleFocus();
    });
    const form = host.querySelector<HTMLFormElement>("form.project-editor");
    const nameInput = form?.querySelector<HTMLInputElement>(
      'input[placeholder="e.g. Doolittle Desktop"]',
    );
    expect(form).toBeDefined();
    expect(nameInput).toBeDefined();
    if (!form || !nameInput) return;

    await act(async () => {
      setInputValue(nameInput, "Release work");
      form.requestSubmit();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(onCreateProject).toHaveBeenCalledOnce();
    expect(host.querySelector("form.project-editor")).toBe(form);
    expect(form.querySelector('[role="alert"]')?.textContent).toBe(
      "Project store unavailable",
    );
    expect(host.querySelector(".project-manager__error")).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
