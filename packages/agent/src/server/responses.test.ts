import { describe, expect, it } from "bun:test";
import { streamSse } from "./responses";

describe("streamSse", () => {
  it("converts producer failures into a terminal SSE error event", async () => {
    const response = streamSse(async (emit) => {
      await emit("response.created", { id: "response-1" });
      throw new Error("local model unavailable");
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("event: response.created");
    expect(body).toContain("event: error");
    expect(body).toContain('"message":"local model unavailable"');
  });
});
