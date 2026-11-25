// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { TeamManagementPanel } from "../../apps/desktop/src/renderer/bots/TeamManagementPanel";

it("keeps the empty agents panel compact and free of a duplicate heading", () => {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(<TeamManagementPanel active={false} empty />));
    const panel = host.querySelector("section.workbench-section");
    expect(panel?.className).toContain("agents-empty");
    expect(panel?.querySelector(".workbench-section__header")).toBeNull();
    expect(panel?.textContent).toContain("No agents yet");
    expect(
      panel?.querySelector(".workbench-empty__actions")?.textContent,
    ).toContain("Create team");
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
