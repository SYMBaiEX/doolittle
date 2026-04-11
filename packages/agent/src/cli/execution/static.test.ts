import { describe, expect, it } from "bun:test";
import { resolveStaticCliInput } from "./static";

describe("resolveStaticCliInput", () => {
  it("handles help, exit, and commands search statically", () => {
    expect(resolveStaticCliInput("exit", "Doolittle")).toEqual({
      text: "Closing Doolittle.",
      tone: "success",
      shouldExit: true,
    });
    expect(resolveStaticCliInput("/help", "Doolittle")?.tone).toBe("info");
    expect(
      resolveStaticCliInput(
        "/commands search terminal",
        "Doolittle",
      )?.text.includes("terminal"),
    ).toBe(true);
  });

  it("returns undefined for dynamic inputs", () => {
    expect(resolveStaticCliInput("/resume", "Doolittle")).toBeUndefined();
    expect(resolveStaticCliInput("hello there", "Doolittle")).toBeUndefined();
  });
});
