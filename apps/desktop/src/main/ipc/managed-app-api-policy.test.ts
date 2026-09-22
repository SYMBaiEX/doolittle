import { describe, expect, it } from "vitest";
import { parseApiPath } from "./agent-transport";

describe("managed app discovery IPC policy", () => {
  it("allows only read-only session discovery through generic transport", () => {
    expect(parseApiPath("/terminal/sessions", "GET")).toBe(
      "/terminal/sessions",
    );
    expect(() => parseApiPath("/terminal/sessions", "POST")).toThrow();
    expect(() =>
      parseApiPath("/terminal/sessions?command=arbitrary", "GET"),
    ).toThrow();
  });
});
