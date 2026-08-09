import { describe, expect, it } from "vitest";
import { parseSuccessfulJson } from "./runtime-http";

describe("parseSuccessfulJson", () => {
  it("returns null for an empty successful response", async () => {
    await expect(
      parseSuccessfulJson(new Response(" \n "), 2_000_000),
    ).resolves.toBe(null);
  });

  it("keeps the established invalid-response error for malformed JSON", async () => {
    await expect(
      parseSuccessfulJson(new Response("{not-json"), 2_000_000),
    ).rejects.toThrow("The local runtime returned an invalid response.");
  });

  it("rejects a response declared larger than its bounded limit", async () => {
    await expect(
      parseSuccessfulJson(
        new Response("{}", { headers: { "content-length": "2000001" } }),
        2_000_000,
      ),
    ).rejects.toThrow("The local runtime response is too large.");
  });

  it("cancels a streamed response that exceeds its bounded limit", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
        controller.enqueue(new Uint8Array(2_000_000));
      },
      cancel() {
        cancelled = true;
      },
    });

    await expect(
      parseSuccessfulJson(new Response(body), 2_000_000),
    ).rejects.toThrow("The local runtime response is too large.");
    expect(cancelled).toBe(true);
  });
});
