import { PassThrough } from "node:stream";
import { syncResolvedApiPort } from "@elizaos/shared";
import { describe, expect, it } from "vitest";
import { internalServerErrorResponse, writeWebResponse } from "./server";

function responseOutput(): PassThrough & {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
} {
  const output = new PassThrough() as PassThrough & {
    statusCode: number;
    setHeader: (name: string, value: string | string[]) => void;
  };
  output.statusCode = 200;
  output.setHeader = () => undefined;
  return output;
}

describe("Eliza-native API environment", () => {
  it("publishes the actual bound port through the SDK contract", () => {
    const env: NodeJS.ProcessEnv = { ELIZA_PORT: "2138" };

    syncResolvedApiPort(env, 48_123);

    expect(env.ELIZA_API_PORT).toBe("48123");
    expect(env.ELIZA_PORT).toBe("48123");
  });
});

describe("writeWebResponse", () => {
  it("keeps internal exception details out of the public error contract", async () => {
    const response = internalServerErrorResponse();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });

  it("resolves when a response finishes normally", async () => {
    const output = responseOutput();
    let body = "";
    output.on("data", (chunk) => {
      body += String(chunk);
    });

    await expect(
      writeWebResponse(
        new Response("complete"),
        output as unknown as import("node:http").ServerResponse,
      ),
    ).resolves.toBeUndefined();

    expect(output.statusCode).toBe(200);
    expect(body).toBe("complete");
  });

  it("destroys the response body and settles when the socket closes early", async () => {
    const output = responseOutput();
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => undefined);
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    const writing = writeWebResponse(
      response,
      output as unknown as import("node:http").ServerResponse,
    );

    output.emit("close");

    await expect(writing).rejects.toThrow(
      "Client disconnected before response completed.",
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cancelled).toBe(true);
  });
});
