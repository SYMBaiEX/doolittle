import { describe, expect, it } from "bun:test";
import blessed from "blessed";
import { createWizardPromptHandlers } from "./prompt-overlays";
import { createPromptYesNoHandler } from "./prompt-overlays/confirm";
import { createSelectManyHandler } from "./prompt-overlays/select-many";
import { createSelectOneHandler } from "./prompt-overlays/select-one";
import { createPromptTextHandler } from "./prompt-overlays/text";
import { createWizardWidgets } from "./widgets";

describe("wizard-screen prompt overlays", () => {
  const formatKeyLabel = (label: string) => `<${label}>`;

  const createDeps = (resolveValue: (title: string) => unknown) => {
    const screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      grabKeys: true,
      mouse: false,
    });
    const widgets = createWizardWidgets(screen, 4, "footer");
    const calls: Array<{ title: string; body: string }> = [];
    const deps = {
      formatKeyLabel,
      render: () => {
        screen.render();
      },
      setFooter: () => {},
      showOverlay: async <U>(
        title: string,
        body: string,
        _mount: (
          overlay: blessed.Widgets.BoxElement,
          resolve: (value: U) => void,
        ) => void,
      ): Promise<U> => {
        calls.push({ title, body });
        return Promise.resolve(resolveValue(title) as U);
      },
      widgets,
    };

    const handlers = createWizardPromptHandlers(deps);

    return {
      deps,
      handlers,
      calls,
      destroy: () => {
        screen.destroy();
      },
    };
  };

  it("delegates text prompts with expected title and subtitle", async () => {
    const { handlers, calls, destroy } = createDeps(() => "value");
    const result = await handlers.promptText("API key", "secret", {
      secret: true,
    });

    expect(result).toBe("value");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.title).toBe("Input");
    expect(calls[0]?.body).toContain("API key");
    expect(calls[0]?.body).toContain("[stored]");

    destroy();
  });

  it("delegates confirm and one-select prompts with expected titles", async () => {
    const { handlers, calls, destroy } = createDeps((title) => {
      if (title === "Confirm") {
        return true;
      }
      if (title === "Choose One") {
        return "a";
      }
      return undefined;
    });
    const yesNo = await handlers.promptYesNo("Enable mode?", true);
    const selected = await handlers.selectOne(
      "Choose provider",
      [
        { value: "a", label: "A", detail: "first" },
        { value: "b", label: "B", detail: "second" },
      ],
      "a",
    );

    expect(yesNo).toBe(true);
    expect(selected).toBe("a");
    expect(calls.map((entry) => entry.title)).toEqual([
      "Confirm",
      "Choose One",
    ]);

    destroy();
  });

  it("delegates multi-select prompts and keeps default fallthrough payloads", async () => {
    const defaults = ["one", "two"];
    const { handlers, calls, destroy } = createDeps(() => defaults);
    const selected = await handlers.selectMany(
      "Choose tags",
      [
        { value: "one", label: "One" },
        { value: "two", label: "Two" },
        { value: "three", label: "Three" },
      ],
      defaults,
    );

    expect(selected).toEqual(defaults);
    expect(calls.at(-1)?.title).toBe("Choose Many");

    destroy();
  });

  it("keeps the decision-local prompt modules wired to the same behavior", async () => {
    const { deps, calls, destroy } = createDeps((title) => {
      if (title === "Input") {
        return "module-value";
      }
      if (title === "Confirm") {
        return false;
      }
      if (title === "Choose One") {
        return "b";
      }
      return ["one"];
    });

    const text = await createPromptTextHandler(deps)("Module prompt", "seed");
    const yesNo = await createPromptYesNoHandler(deps)("Module confirm", false);
    const selectedOne = await createSelectOneHandler(deps)(
      "Module select one",
      [
        { value: "a", label: "A", detail: "first" },
        { value: "b", label: "B", detail: "second" },
      ],
      "a",
    );
    const selectedMany = await createSelectManyHandler(deps)(
      "Module select many",
      [
        { value: "one", label: "One" },
        { value: "two", label: "Two" },
      ],
      ["one"],
    );

    expect(text).toBe("module-value");
    expect(yesNo).toBe(false);
    expect(selectedOne).toBe("b");
    expect(selectedMany).toEqual(["one"]);
    expect(calls.map((entry) => entry.title)).toEqual([
      "Input",
      "Confirm",
      "Choose One",
      "Choose Many",
    ]);

    destroy();
  });
});
