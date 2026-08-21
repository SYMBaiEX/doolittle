// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FlatSetting,
  SettingControl,
  settingControlId,
} from "./SettingsFields";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SettingControl accessibility", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("associates every dynamic control type with its visible field label", () => {
    const fields: FlatSetting[] = [
      { category: "agent", path: "agent.name", value: "Doolittle" },
      { category: "agent", path: "agent.instructions", value: ["be kind"] },
      { category: "agent", path: "agent.runDepth", value: "standard" },
      { category: "agent", path: "agent.maxIterations", value: 12 },
      { category: "agent", path: "agent.enabled", value: true },
    ];

    act(() =>
      root.render(
        fields.map((field) => (
          <SettingControl field={field} key={field.path} onSaved={vi.fn()} />
        )),
      ),
    );

    const expected = [
      ["agent.name", "Name", "input"],
      ["agent.instructions", "Instructions", "textarea"],
      ["agent.runDepth", "Run Depth", "select"],
      ["agent.maxIterations", "Max Iterations", "input"],
      ["agent.enabled", "Enabled", "input"],
    ] as const;
    for (const [path, name, element] of expected) {
      const id = settingControlId(path);
      expect(container.querySelector(`label[for="${id}"]`)?.textContent).toBe(
        name,
      );
      expect(container.querySelector(`${element}#${id}`)).not.toBeNull();
    }
  });
});
