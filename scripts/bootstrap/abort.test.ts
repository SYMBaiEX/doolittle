import { describe, expect, it } from "bun:test";
import { BootstrapAbortError, createBootstrapAbortHandle } from "./abort";

describe("bootstrap abort handle", () => {
  it("rejects raced work after an abort request", async () => {
    const abortHandle = createBootstrapAbortHandle();
    const pending = abortHandle.race(new Promise<string>(() => {}));

    abortHandle.abort("stop here");

    await expect(pending).rejects.toBeInstanceOf(BootstrapAbortError);
    expect(() => abortHandle.throwIfAborted()).toThrow("stop here");
  });

  it("passes through completed work before any abort", async () => {
    const abortHandle = createBootstrapAbortHandle();

    await expect(abortHandle.race(Promise.resolve("ok"))).resolves.toBe("ok");
  });
});
