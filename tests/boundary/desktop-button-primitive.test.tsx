// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkbenchAction } from "../../apps/desktop/src/renderer/components/workbench/Workbench";
import { ErrorBlock } from "../../apps/desktop/src/renderer/lib";
import { Button } from "../../packages/ui/src/controls";

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

it("marks canonical button variants without reclassifying upstream compatibility variants", () => {
  act(() => {
    root.render(
      <>
        <Button variant="primary">Save</Button>
        <Button variant="secondary">Open</Button>
        <Button variant="danger">Delete</Button>
        <Button variant="text">Cancel</Button>
        <Button variant="default">Legacy default</Button>
      </>,
    );
  });

  const [primary, secondary, danger, text, legacy] = [
    ...container.querySelectorAll("button"),
  ];
  expect(primary?.classList.contains("dl-button--primary")).toBe(true);
  expect(secondary?.classList.contains("dl-button--secondary")).toBe(true);
  expect(danger?.classList.contains("dl-button--danger")).toBe(true);
  expect(text?.classList.contains("dl-button--text")).toBe(true);
  expect(legacy?.classList.contains("dl-button--primary")).toBe(false);
});

it("uses the canonical text variant for owned error retries", () => {
  act(() => {
    root.render(<ErrorBlock error="Load failed" retry={() => {}} />);
  });

  const retry = container.querySelector("button");
  expect(retry?.textContent).toBe("Try again");
  expect(retry?.classList.contains("dl-button--text")).toBe(true);
});

it("uses canonical variants for owned workbench actions", () => {
  act(() => {
    root.render(
      <>
        <WorkbenchAction emphasis="primary">Run</WorkbenchAction>
        <WorkbenchAction emphasis="danger">Delete</WorkbenchAction>
      </>,
    );
  });

  const [primary, danger] = [...container.querySelectorAll("button")];
  expect(primary?.classList.contains("dl-button--primary")).toBe(true);
  expect(danger?.classList.contains("dl-button--danger")).toBe(true);
});
