// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CatalogFilterBar } from "../../apps/desktop/src/renderer/components/CatalogFilterBar";

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

function FilterBarFixture({ options }: { options: readonly string[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  return (
    <CatalogFilterBar
      category={{
        label: "Tool category",
        onChange: setCategory,
        options,
        value: category,
      }}
      onQueryChange={setQuery}
      placeholder="Search tools"
      query={query}
      resultLabel="2 of 2"
      searchLabel="Search tools"
    />
  );
}

const picker = () =>
  container.querySelector<HTMLButtonElement>('[role="combobox"]');

it("hides the category picker when fewer than two real categories exist", () => {
  act(() => root.render(<FilterBarFixture options={["all"]} />));
  expect(picker()).toBeNull();

  act(() => root.render(<FilterBarFixture options={["all", "files"]} />));
  expect(picker()).toBeNull();

  act(() =>
    root.render(<FilterBarFixture options={["all", "files", "shell"]} />),
  );
  expect(picker()).not.toBeNull();
  expect(picker()?.getAttribute("aria-label")).toBe("Tool category");
});
