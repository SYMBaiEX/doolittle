import { describe, expect, it } from "vitest";
import { writeResponseAndRunPostCommit } from "../server";
import {
  json,
  onResponseCommitted,
  runResponsePostCommit,
  sse,
  streamSse,
} from "./responses";

describe("response constructors", () => {
  it("does not run post-commit work until the server confirms the response write", () => {
    let started = false;
    const response = onResponseCommitted(json({ ok: true }), () => {
      started = true;
    });
    expect(started).toBe(false);
    runResponsePostCommit(response);
    expect(started).toBe(true);
  });

  it("runs durable post-commit work once after a successful write settles", async () => {
    const order: string[] = [];
    const response = onResponseCommitted(json({ ok: true }), () => {
      order.push("commit");
    });

    await writeResponseAndRunPostCommit(response, async () => {
      order.push("write");
    });

    expect(order).toEqual(["write", "commit"]);
    runResponsePostCommit(response);
    expect(order).toEqual(["write", "commit"]);
  });

  it("runs durable post-commit work once after a failed write settles", async () => {
    const order: string[] = [];
    const response = onResponseCommitted(json({ ok: true }), () => {
      order.push("commit");
    });
    await expect(
      writeResponseAndRunPostCommit(response, async () => {
        order.push("write");
        throw new Error("client disconnected");
      }),
    ).rejects.toThrow("client disconnected");
    expect(order).toEqual(["write", "commit"]);
    runResponsePostCommit(response);
    expect(order).toEqual(["write", "commit"]);
  });
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

  it("notifies server work when the SSE consumer cancels", async () => {
    let cancelled = false;
    const response = streamSse(
      async () => {
        await new Promise<void>(() => undefined);
      },
      {
        onCancel: () => {
          cancelled = true;
        },
      },
    );

    const reader = response.body?.getReader();
    await reader?.cancel();

    expect(cancelled).toBe(true);
  });
});
