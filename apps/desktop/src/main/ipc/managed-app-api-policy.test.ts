import { describe, expect, it } from "vitest";
import { parseApiPath } from "./agent-transport";

describe("managed app discovery IPC policy", () => {
  it("allows exact host team catalog commands but no arbitrary team resource actions", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(parseApiPath("/bots/teams", "GET")).toBe("/bots/teams");
    expect(parseApiPath("/bots/teams", "POST")).toBe("/bots/teams");
    expect(parseApiPath(`/bots/teams/${id}`, "PATCH")).toBe(
      `/bots/teams/${id}`,
    );
    expect(parseApiPath(`/bots/teams/${id}/archive`, "POST")).toBe(
      `/bots/teams/${id}/archive`,
    );
    expect(() => parseApiPath(`/bots/teams/${id}/send`, "POST")).toThrow();
    expect(() => parseApiPath("/bots/teams?credentials=true", "GET")).toThrow();
    expect(() => parseApiPath(`/bots/teams/${id}`, "DELETE")).toThrow();
  });
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
