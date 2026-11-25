// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ProjectManager } from "../../apps/desktop/src/renderer/components/ProjectManager";

const noop = () => {};

it("announces only concise project detail changes", () => {
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
          onScopeChange={noop}
          projects={[
            { id: "alpha", name: "Alpha" },
            { id: "beta", name: "Beta" },
          ]}
        />,
      ),
    );

    const detail = host.querySelector("section");
    expect(detail?.hasAttribute("aria-live")).toBe(false);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Showing details for Alpha.",
    );

    const beta = [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Beta"),
    );
    expect(beta).toBeDefined();
    act(() => beta?.click());

    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Showing details for Beta.",
    );
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
