import { describe, expect, it } from "bun:test";
import { readEntrypointStdinText } from "./stdin";

describe("readEntrypointStdinText", () => {
  it("skips reading when stdin is interactive", async () => {
    const stdin = {
      isTTY: true,
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            throw new Error("stdin should not be read");
          },
        };
      },
    };

    await expect(readEntrypointStdinText(stdin)).resolves.toBe("");
  });

  it("collects piped input into a utf-8 string", async () => {
    const stdin = {
      isTTY: false,
      async *[Symbol.asyncIterator]() {
        yield "hello ";
        yield Buffer.from("world");
      },
    };

    await expect(readEntrypointStdinText(stdin)).resolves.toBe("hello world");
  });
});
