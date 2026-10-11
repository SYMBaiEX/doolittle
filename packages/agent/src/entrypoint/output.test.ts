import { describe, expect, it, vi } from "vitest";
import { printOneShotResult } from "./output";

describe("one-shot result evidence", () => {
  it("prints ok:false for resolved execution errors", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    printOneShotResult({ text: "permission denied", tone: "error" }, true);
    expect(JSON.parse(output.mock.calls[0]?.[0])).toMatchObject({
      ok: false,
      tone: "error",
    });
  });

  it("prints ok:true only for a normal completed result", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    printOneShotResult({ text: "done", tone: "success" }, true);
    expect(JSON.parse(output.mock.calls[0]?.[0])).toMatchObject({ ok: true });
  });

  it("keeps authoritative cancellation false even with an agent reply", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    printOneShotResult(
      { text: "stopped", tone: "agent", status: "cancelled" },
      true,
    );
    expect(JSON.parse(output.mock.calls[0]?.[0])).toMatchObject({ ok: false });
  });
});
