// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProjectManager } from "../../apps/desktop/src/renderer/components/ProjectManager";

const noop = () => {};

it("uses canonical empty variants and offers project creation", () => {
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
          onCreateProject={vi.fn(async () => {})}
          onScopeChange={noop}
          projects={[]}
        />,
      ),
    );

    const listEmpty = host.querySelector(
      ".project-manager__empty .dl-state-surface",
    );
    expect(listEmpty?.getAttribute("data-variant")).toBe("inline");
    expect(listEmpty?.querySelector(".dl-state-title")?.tagName).toBe("P");
    expect(listEmpty?.textContent).toContain("No projects yet.");

    const detailEmpty = host.querySelector(
      ".project-manager__empty-detail .dl-state-surface",
    );
    expect(detailEmpty?.getAttribute("data-variant")).toBe("hero");
    expect(detailEmpty?.getAttribute("data-kind")).toBe("empty");
    const create = detailEmpty?.querySelector<HTMLButtonElement>(
      ".dl-state-action button",
    );
    expect(create?.textContent).toContain("Create your first project");
    act(() => create?.click());
    // The honest action opens the same project editor as the New control.
    expect(host.textContent).toContain("Create a project");
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
