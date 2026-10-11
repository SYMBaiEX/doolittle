// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib", async () => ({
  ...(await vi.importActual<typeof import("../lib")>("../lib")),
  desktopRequest: request,
}));

import {
  type FlatSetting,
  SettingControl,
  SettingsFieldCollection,
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
    request.mockReset();
    request.mockResolvedValue({});
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
      const control = container.querySelector(`${element}#${id}`);
      expect(control).not.toBeNull();
      expect(control?.getAttribute("aria-describedby")).toContain(
        `${id}-description`,
      );
      expect(
        container.querySelector(`#${id}-description`)?.textContent,
      ).toBeTruthy();
    }
  });

  it("only enables Save after an edit and exposes the full boolean switch target", () => {
    const field: FlatSetting = {
      category: "agent",
      path: "agent.enabled",
      value: true,
    };
    act(() => root.render(<SettingControl field={field} onSaved={vi.fn()} />));

    const save =
      container.querySelector<HTMLButtonElement>(".secondary-button");
    const switchLabel = container.querySelector<HTMLLabelElement>(
      ".setting-control label",
    );
    const checkbox = container.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    );
    expect(save?.disabled).toBe(true);
    expect(switchLabel?.control).toBe(checkbox);
    expect(switchLabel?.className).toContain("relative");
    expect(checkbox?.className).toContain("!w-px");
    expect(checkbox?.className).toContain("!p-0");
    expect(checkbox?.getAttribute("aria-labelledby")).toBe(
      `${settingControlId(field.path)}-label`,
    );
    expect(
      container.querySelector(`#${settingControlId(field.path)}-label`)
        ?.textContent,
    ).toBe("Enabled");
    act(() => checkbox?.click());
    expect(save?.disabled).toBe(false);
    expect(save?.getAttribute("aria-label")).toBe("Save Enabled");
  });

  it("preserves an edited field when fresh server configuration arrives", () => {
    const field = { category: "agent", path: "agent.name", value: "Original" };
    act(() => root.render(<SettingControl field={field} onSaved={vi.fn()} />));
    const input = container.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("Expected a field input");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "My draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Unsaved change");
    act(() =>
      root.render(
        <SettingControl
          field={{ ...field, value: "New server value" }}
          onSaved={vi.fn()}
        />,
      ),
    );
    expect(input.value).toBe("My draft");
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Discard changes to Name"]',
        )
        ?.click(),
    );
    expect(input.value).toBe("New server value");
  });

  it("blocks duplicate field saves before React has rendered the busy state", async () => {
    let resolve: (() => void) | undefined;
    request.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const onSaved = vi.fn();
    act(() =>
      root.render(
        <SettingControl
          field={{ category: "agent", path: "agent.enabled", value: true }}
          onSaved={onSaved}
        />,
      ),
    );
    act(() => container.querySelector<HTMLInputElement>("input")?.click());
    const save =
      container.querySelector<HTMLButtonElement>(".secondary-button");
    if (!save) throw new Error("Expected a save button");
    await act(async () => {
      save.click();
      save.click();
    });
    expect(request).toHaveBeenCalledOnce();
    expect(save.disabled).toBe(true);
    await act(async () => resolve?.());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Saved");
  });

  it("keeps the edited value and exposes a linked error after a failed save", async () => {
    request.mockRejectedValue(new Error("Configuration was not accepted"));
    act(() =>
      root.render(
        <SettingControl
          field={{ category: "agent", path: "agent.enabled", value: true }}
          onSaved={vi.fn()}
        />,
      ),
    );
    const input = container.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("Expected a field input");
    act(() => input.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".secondary-button")?.click(),
    );
    expect(input.checked).toBe(false);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("-error");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Configuration was not accepted",
    );
  });

  it("explains and enforces runtime read-only state", () => {
    act(() =>
      root.render(
        <SettingControl
          readOnly
          field={{ category: "agent", path: "agent.enabled", value: true }}
          onSaved={vi.fn()}
        />,
      ),
    );
    expect(container.querySelector<HTMLInputElement>("input")?.disabled).toBe(
      true,
    );
    expect(container.textContent).toContain(
      "Read-only while the runtime is changing",
    );
    act(() =>
      container.querySelector<HTMLButtonElement>(".secondary-button")?.click(),
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("retains unsaved fields across filtering and advanced regrouping without persisting drafts", () => {
    const field = { category: "agent", path: "agent.enabled", value: true };
    const render = (fields: FlatSetting[], advanced = false) =>
      root.render(
        <SettingsFieldCollection
          fields={fields}
          advanced={advanced}
          query={fields.length ? "enabled" : "missing"}
          onReload={vi.fn()}
          onSaved={vi.fn()}
        />,
      );
    act(() => render([field]));
    act(() => container.querySelector<HTMLInputElement>("input")?.click());
    expect(container.textContent).toContain("Unsaved change");
    act(() => render([]));
    expect(container.textContent).toContain("No settings match");
    act(() => render([field], true));
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      false,
    );
    expect(container.textContent).toContain("Unsaved change");
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps one collection-owned save across filtering and refreshes a successful hidden row", async () => {
    let resolve: (() => void) | undefined;
    request.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const field = { category: "agent", path: "agent.enabled", value: true };
    const onSaved = vi.fn();
    const render = (fields: FlatSetting[]) =>
      root.render(
        <SettingsFieldCollection
          fields={fields}
          advanced={false}
          query={fields.length ? "enabled" : "missing"}
          onReload={vi.fn()}
          onSaved={onSaved}
        />,
      );
    act(() => render([field]));
    act(() => container.querySelector<HTMLInputElement>("input")?.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".secondary-button")?.click(),
    );
    act(() => render([]));
    act(() => render([field]));
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      false,
    );
    expect(container.querySelector<HTMLInputElement>("input")?.disabled).toBe(
      true,
    );
    expect(
      container.querySelector<HTMLButtonElement>(".secondary-button")?.disabled,
    ).toBe(true);
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".secondary-button")?.click(),
    );
    expect(request).toHaveBeenCalledOnce();
    act(() => render([]));
    await act(async () => resolve?.());
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(field);
    // Even before the refreshed document arrives, the row knows its confirmed
    // value, not an obsolete cached baseline or an unconfirmed draft.
    act(() => render([field]));
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      false,
    );
    expect(container.querySelector<HTMLInputElement>("input")?.disabled).toBe(
      false,
    );
    expect(
      container.querySelector<HTMLButtonElement>(".secondary-button")?.disabled,
    ).toBe(true);
    expect(container.textContent).not.toContain("Unsaved change");
    expect(container.textContent).toContain("Saved");
  });

  it("retains a hidden failed save as a recoverable draft rather than refreshing or reporting success", async () => {
    let reject: ((error: Error) => void) | undefined;
    request.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const field = { category: "agent", path: "agent.enabled", value: true };
    const onSaved = vi.fn();
    const render = (fields: FlatSetting[]) =>
      root.render(
        <SettingsFieldCollection
          fields={fields}
          advanced={false}
          query="enabled"
          onReload={vi.fn()}
          onSaved={onSaved}
        />,
      );
    act(() => render([field]));
    act(() => container.querySelector<HTMLInputElement>("input")?.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".secondary-button")?.click(),
    );
    act(() => render([]));
    await act(async () => reject?.(new Error("Write could not be confirmed")));
    expect(onSaved).not.toHaveBeenCalled();
    act(() => render([field]));
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      false,
    );
    expect(container.querySelector<HTMLInputElement>("input")?.disabled).toBe(
      false,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Write could not be confirmed",
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Discard changes to Enabled"]',
        )
        ?.click(),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      true,
    );
  });

  it("does not let a disposed collection complete into a replacement collection", async () => {
    let resolve: (() => void) | undefined;
    request.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const field = { category: "agent", path: "agent.enabled", value: true };
    const onSaved = vi.fn();
    const render = () =>
      root.render(
        <SettingsFieldCollection
          fields={[field]}
          advanced={false}
          query=""
          onReload={vi.fn()}
          onSaved={onSaved}
        />,
      );
    act(render);
    act(() => container.querySelector<HTMLInputElement>("input")?.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".secondary-button")?.click(),
    );
    act(() => root.render(<div>Another settings owner</div>));
    act(render);
    await act(async () => resolve?.());
    expect(onSaved).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      true,
    );
    expect(
      container.querySelector(".settings-control-feedback")?.textContent,
    ).toBe("");
    expect(container.textContent).not.toContain("Unsaved change");
  });

  it("retires a confirmed save after host acknowledgment so a later host reversion survives filtering", async () => {
    const field = { category: "agent", path: "agent.enabled", value: true };
    const onSaved = vi.fn();
    const render = (fields: FlatSetting[]) =>
      root.render(
        <SettingsFieldCollection
          fields={fields}
          advanced={false}
          query=""
          onReload={vi.fn()}
          onSaved={onSaved}
        />,
      );
    act(() => render([field]));
    act(() => container.querySelector<HTMLInputElement>("input")?.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".secondary-button")?.click(),
    );
    expect(onSaved).toHaveBeenCalledOnce();
    act(() => render([{ ...field, value: false }])); // Authoritative acknowledgment.
    act(() => render([field])); // A later runtime/external edit restores the old value.
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      true,
    );
    act(() => render([]));
    act(() => render([field]));
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      true,
    );
    expect(
      container.querySelector<HTMLButtonElement>(".secondary-button")?.disabled,
    ).toBe(true);
    expect(container.textContent).not.toContain("Unsaved change");
  });

  it("recognizes normalized numeric host acknowledgments rather than keeping the formatted input cached", async () => {
    const field = { category: "agent", path: "agent.maxIterations", value: 12 };
    const render = (fields: FlatSetting[]) =>
      root.render(
        <SettingsFieldCollection
          fields={fields}
          advanced={false}
          query=""
          onReload={vi.fn()}
          onSaved={vi.fn()}
        />,
      );
    act(() => render([field]));
    const input = container.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("Expected a numeric field");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "03");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".secondary-button")?.click(),
    );
    expect(request).toHaveBeenCalledWith("/settings", "POST", {
      path: field.path,
      value: 3,
    });
    act(() => render([{ ...field, value: 3 }]));
    act(() => render([field]));
    act(() => render([]));
    act(() => render([field]));
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe(
      "12",
    );
    expect(container.textContent).not.toContain("Unsaved change");
  });
});
