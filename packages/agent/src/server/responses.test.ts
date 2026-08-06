import { describe, expect, it } from "vitest";
import { json, sse, streamSse } from "./responses";

describe("response constructors", () => {
  it("leave CORS policy to the HTTP server boundary", () => {
    for (const response of [json({ ok: true }), sse([])]) {
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("access-control-allow-methods")).toBeNull();
      expect(response.headers.get("access-control-allow-headers")).toBeNull();
    }
  });
});

describe("streamSse", () => {
  it("converts producer failures into a terminal SSE error event", async () => {
    const response = streamSse(async (emit) => {
      await emit("response.created", { id: "response-1" });
      throw new Error("local model unavailable");
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const body = await response.text();
    expect(body).toContain("event: response.created");
    expect(body).toContain("event: error");
    expect(body).toContain('"message":"local model unavailable"');
  });
});
