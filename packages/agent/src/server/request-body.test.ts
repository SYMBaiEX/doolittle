import { describe, expect, it } from "vitest";
import { readJsonObjectBody } from "./request-body";

describe("readJsonObjectBody", () => {
  it("accepts JSON objects", async () => {
    await expect(
      readJsonObjectBody(
        new Request("http://localhost/test", {
          method: "POST",
          body: JSON.stringify({ value: true }),
        }),
      ),
    ).resolves.toEqual({ ok: true, value: { value: true } });
  });

  it.each([
    ["malformed JSON", "not-json", "invalid_json"],
    ["null", "null", "not_object"],
    ["an array", "[]", "not_object"],
    ["a primitive", '"value"', "not_object"],
  ])("rejects %s", async (_label, body, reason) => {
    await expect(
      readJsonObjectBody(
        new Request("http://localhost/test", { method: "POST", body }),
      ),
    ).resolves.toEqual({ ok: false, reason });
  });
});
