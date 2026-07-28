import { describe, expect, it } from "vitest";
import { BackendUrlParser, parseBackendUrl } from "./backend-url";

describe("parseBackendUrl", () => {
  it("extracts the actual loopback listener", () => {
    expect(
      parseBackendUrl("Doolittle API listening on http://127.0.0.1:43817"),
    ).toBe("http://127.0.0.1:43817");
  });

  it("normalizes wildcard listeners and rejects unresolved ports", () => {
    expect(parseBackendUrl("Agent API listening on http://0.0.0.0:9123")).toBe(
      "http://127.0.0.1:9123",
    );
    expect(
      parseBackendUrl("Agent API listening on http://127.0.0.1:0"),
    ).toBeNull();
    expect(parseBackendUrl("ordinary log output")).toBeNull();
  });

  it("buffers listening announcements split across process chunks", () => {
    const parser = new BackendUrlParser();
    expect(parser.push("startup log\nDoolittle API liste")).toBeNull();
    expect(parser.push("ning on http://127.0.0.1:43")).toBeNull();
    expect(parser.push("817\nmore output")).toBe("http://127.0.0.1:43817");
  });
});
