// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Welcome } from "../../apps/desktop/src/renderer/chat/Welcome";
import { THEME_MANIFEST_CHANGE_EVENT } from "../../apps/desktop/src/renderer/desktop-theme";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.dataset.uiMaterial = "flat";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete document.documentElement.dataset.uiMaterial;
});
function material(value: string) {
  act(() => {
    document.documentElement.dataset.uiMaterial = value;
    window.dispatchEvent(new Event(THEME_MANIFEST_CHANGE_EVENT));
  });
}
it("changes the composition without starting a task or replacing the starter controls", () => {
  const select = vi.fn();
  act(() => root.render(<Welcome onSelect={select} projectName="Doolittle" />));
  const starters = container.querySelector("details");
  expect(starters?.open).toBe(false);
  for (const value of ["cel", "glass"]) {
    material(value);
    expect(container.querySelector("details")).toBe(starters);
    expect(starters?.open).toBe(true);
    expect(select).not.toHaveBeenCalled();
  }
  act(() => container.querySelector("button")?.click());
  expect(select).toHaveBeenCalledExactlyOnceWith("Explain this project");
  expect(starters?.open).toBe(true);
});
it("returns to the original quiet welcome when the material is removed", () => {
  act(() => root.render(<Welcome onSelect={() => {}} />));
  material("cel");
  expect(container.querySelector(".welcome-art")).not.toBeNull();
  material("flat");
  expect(container.querySelector(".welcome-art")).toBeNull();
  expect(container.querySelector("h1")?.textContent).toBe(
    "What’s on your mind?",
  );
  expect(container.querySelector("details")?.open).toBe(false);
});
