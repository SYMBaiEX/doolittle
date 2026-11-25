// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { GitControlPanel } from "../../apps/desktop/src/renderer/components/GitControlPanel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function expectPersistentLabel(selector: string, labelText: string) {
  const control = container.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(selector);
  expect(control).not.toBeNull();
  expect(control?.id).toBeTruthy();
  const label = Array.from(
    container.querySelectorAll<HTMLLabelElement>("label"),
  ).find((candidate) => candidate.htmlFor === control?.id);
  expect(label?.textContent).toContain(labelText);
  expect(label?.contains(control ?? null)).toBe(true);
}

it("labels commit and advanced repository controls persistently", () => {
  act(() =>
    root.render(
      <GitControlPanel
        active
        branches={[{ current: true, name: "main" }]}
        remotes={[
          { fetchUrl: "https://github.com/org/repo.git", name: "origin" },
        ]}
        stashes={[{ message: "work in progress", reference: "stash@{0}" }]}
      />,
    ),
  );

  expectPersistentLabel(
    'textarea[placeholder="Describe the change"]',
    "Commit message",
  );
  expectPersistentLabel(
    'input[placeholder="feature/short-name"]',
    "New branch name",
  );
  expectPersistentLabel(
    'input[placeholder="Optional stash message"]',
    "Stash message",
  );
  expectPersistentLabel(
    'input[placeholder="Commit SHA or ref"]',
    "Commit SHA or ref",
  );
  expectPersistentLabel('input[placeholder="Remote name"]', "Remote name");
  expectPersistentLabel(
    'input[placeholder="https://github.com/org/repo.git"]',
    "Remote URL",
  );
});
