import { describe, expect, it } from "bun:test";
import { installBlessedTextboxGuard } from "./blessed-guards";

describe("installBlessedTextboxGuard", () => {
  it("ignores stale enter events after blessed tears down _done", () => {
    let callCount = 0;
    const textboxPrototype = {
      _listener(
        this: { _done?: unknown },
        _ch: string,
        key: { name?: string },
      ) {
        callCount += 1;
        if (key.name === "enter") {
          return typeof this._done;
        }
        return "ok";
      },
    };
    installBlessedTextboxGuard({
      textbox: {
        prototype: textboxPrototype,
      },
    });

    const staleTextbox = {
      _done: undefined,
    };
    const activeTextbox = {
      _done: () => undefined,
    };

    expect(
      textboxPrototype._listener?.call(staleTextbox, "\r", { name: "enter" }),
    ).toBeUndefined();
    expect(callCount).toBe(0);
    expect(
      textboxPrototype._listener?.call(activeTextbox, "\r", { name: "enter" }),
    ).toBe("function");
    expect(callCount).toBe(1);
  });
});
