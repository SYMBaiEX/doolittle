import { describe, expect, it } from "vitest";
import { createTuiWidgets } from "@/cli/tui-widget-factory";
import { getTuiTheme } from "@/runtime/theme-catalog";

function createBlessedStub() {
  const boxes: unknown[] = [];
  const logs: unknown[] = [];
  const textboxes: unknown[] = [];
  const lists: unknown[] = [];
  const textareas: unknown[] = [];

  return {
    blessed: {
      box(options: unknown) {
        boxes.push(options);
        return options;
      },
      log(options: unknown) {
        logs.push(options);
        return options;
      },
      textbox(options: unknown) {
        textboxes.push(options);
        return options;
      },
      list(options: unknown) {
        lists.push(options);
        return options;
      },
      textarea(options: unknown) {
        textareas.push(options);
        return options;
      },
    },
    boxes,
    logs,
    textboxes,
    lists,
    textareas,
  };
}

describe("createTuiWidgets", () => {
  it("creates the expected screen widget set", () => {
    const stub = createBlessedStub();
    const widgets = createTuiWidgets({
      screen: {} as never,
      theme: getTuiTheme("radar"),
      agentName: "Doolittle",
      ui: stub.blessed as never,
    });

    expect(widgets.inputBox).toBeDefined();
    expect(widgets.footer).toBeDefined();
    expect(widgets.assistBox).toBeDefined();
    expect(stub.logs).toHaveLength(1);
    expect(stub.textboxes).toHaveLength(2);
    expect(stub.textareas).toHaveLength(1);
    expect(stub.lists).toHaveLength(1);
    expect(stub.textboxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: " Input " }),
        expect.objectContaining({ label: " Search " }),
      ]),
    );
    expect(stub.textareas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: " Input (Ctrl-S submit, Esc close) ",
        }),
      ]),
    );
    expect(stub.boxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: " Conversation " }),
        expect.objectContaining({ label: " Status " }),
        expect.objectContaining({ label: " Transports " }),
        expect.objectContaining({ label: " Execution " }),
        expect.objectContaining({ label: " Controls " }),
        expect.objectContaining({ label: " Commands " }),
        expect.objectContaining({ label: " Multiline input " }),
      ]),
    );
    expect(stub.logs).toEqual([
      expect.objectContaining({ label: " Activity " }),
    ]);
  });
});
