// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EmptyBlock } from "../../apps/desktop/src/renderer/lib";
import { StateSurface } from "../../packages/ui/src/surfaces";

const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  previousActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

it("supports title-only empty states and maps legacy compact density to pane", () => {
  act(() => {
    root.render(
      <>
        <EmptyBlock title="Nothing selected" />
        <EmptyBlock density="compact" title="No runs yet" />
      </>,
    );
  });

  const blocks = [...container.querySelectorAll(".empty-block")];
  const hero = blocks[0]?.querySelector(".dl-state-surface");
  const pane = blocks[1]?.querySelector(".dl-state-surface");
  expect(blocks[0]?.classList.contains("empty-block--hero")).toBe(true);
  expect(hero?.getAttribute("data-variant")).toBe("hero");
  expect(hero?.querySelector(".dl-meta")).toBeNull();
  expect(blocks[1]?.classList.contains("empty-block--pane")).toBe(true);
  expect(blocks[1]?.classList.contains("empty-block--compact")).toBe(true);
  expect(pane?.getAttribute("data-variant")).toBe("pane");
  expect(pane?.querySelector(".dl-meta")).toBeNull();
});

it("uses non-heading inline copy for factual empty and drop-zone regions", () => {
  act(() => {
    root.render(
      <EmptyBlock title="No artifacts recorded" variant="inline">
        Artifacts appear after the run finishes.
      </EmptyBlock>,
    );
  });

  const wrapper = container.querySelector(".empty-block");
  const surface = container.querySelector(".dl-state-surface");
  const title = surface?.querySelector(".dl-state-title");
  expect(wrapper?.classList.contains("empty-block--inline")).toBe(true);
  expect(surface?.getAttribute("data-variant")).toBe("inline");
  expect(title?.tagName).toBe("P");
  expect(surface?.querySelector("h2")).toBeNull();
  expect(surface?.querySelector(".dl-meta")?.textContent).toBe(
    "Artifacts appear after the run finishes.",
  );
});

it("exposes the same variants on the shared state surface", () => {
  act(() => {
    root.render(
      <>
        <StateSurface kind="empty" title="Hero state" />
        <StateSurface kind="empty" title="Pane state" variant="pane" />
        <StateSurface kind="empty" title="Inline state" variant="inline" />
      </>,
    );
  });

  expect(
    [...container.querySelectorAll(".dl-state-surface")].map((surface) =>
      surface.getAttribute("data-variant"),
    ),
  ).toEqual(["hero", "pane", "inline"]);
});
