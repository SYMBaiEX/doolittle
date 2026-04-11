import { describe, expect, it } from "bun:test";
import { createBlessedOutputProxy } from "@/cli/tui-output-proxy";

describe("createBlessedOutputProxy", () => {
  it("keeps write raw and binds other methods to the original stream", () => {
    const stream = {
      touched: 0,
      write(this: { touched: number }, chunk: string) {
        this.touched += chunk.length;
        return true;
      },
      close(this: { touched: number }) {
        this.touched += 10;
        return this.touched;
      },
    } as unknown as NodeJS.WriteStream & {
      touched: number;
      close(): number;
    };

    const rawWrite = stream.write.bind(stream);
    const proxy = createBlessedOutputProxy(stream);

    expect(proxy.write("hey")).toBe(true);
    expect(stream.touched).toBe(3);
    expect(rawWrite("ok")).toBe(true);
    expect(stream.touched).toBe(5);
    expect((proxy as NodeJS.WriteStream & { close(): number }).close()).toBe(
      15,
    );
  });
});
