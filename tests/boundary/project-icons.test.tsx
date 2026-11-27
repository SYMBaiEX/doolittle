// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { projectLabel } from "../../apps/desktop/src/renderer/project-manager/models";
import { ProjectAvatar } from "../../apps/desktop/src/renderer/project-manager/ProjectAvatar";
import { resolveProjectIcon } from "../../apps/desktop/src/renderer/project-manager/ProjectIconGlyph";

it("resolves curated project icon names without exposing raw text", () => {
  expect(resolveProjectIcon("map")).toBeDefined();
  expect(resolveProjectIcon("Anchor")).toBeDefined();
  expect(resolveProjectIcon("map_pin")).toBeDefined();
  expect(resolveProjectIcon("not-a-project-icon")).toBeUndefined();
});

it("renders named icons as glyphs and falls back honestly", () => {
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
        <>
          <ProjectAvatar
            project={{ id: "map", name: "Cartographer", icon: "map" }}
          />
          <ProjectAvatar
            project={{ id: "anchor", name: "Quiet harbor", icon: "anchor" }}
            size="small"
          />
          <ProjectAvatar
            project={{ id: "unknown", name: "Quiet harbor", icon: "schooner" }}
          />
        </>,
      ),
    );

    expect(host.querySelectorAll("svg")).toHaveLength(2);
    expect(host.textContent).toBe("Q");
    expect(host.textContent).not.toContain("map");
    expect(host.textContent).not.toContain("anchor");
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});

it("keeps short symbolic icons while long unknown names use initials", () => {
  expect(projectLabel({ id: "emoji", name: "Harbor", icon: "⚓" })).toBe("⚓");
  expect(projectLabel({ id: "word", name: "Harbor", icon: "anchor" })).toBe(
    "H",
  );
});
