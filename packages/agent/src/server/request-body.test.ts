import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  assertDeclaredRequestBodyLimit,
  RequestBodyTimeoutError,
  RequestBodyTooLargeError,
  readBoundedRequestBody,
  readJsonObjectBody,
  requestBodyFraming,
} from "./request-body";

function incomingBody(
  chunks: Array<string | Uint8Array>,
  headers: IncomingMessage["headers"] = {},
  method = "POST",
): IncomingMessage {
  const stream = Readable.from(chunks) as IncomingMessage;
  stream.method = method;
  stream.headers = headers;
  return stream;
}

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

describe("readBoundedRequestBody", () => {
  it("classifies declared and transfer-encoded body framing", () => {
    expect(
      requestBodyFraming(incomingBody([], { "content-length": "0" })),
    ).toEqual({ declaredBytes: 0, hasBody: false, transferEncoded: false });
    expect(
      requestBodyFraming(incomingBody([], { "transfer-encoding": "chunked" })),
    ).toEqual({ declaredBytes: null, hasBody: true, transferEncoded: true });
  });

  it("rejects oversized declared bodies without consuming the stream", () => {
    const request = incomingBody(["body"], { "content-length": "5" });

    expect(() => assertDeclaredRequestBodyLimit(request, 4)).toThrow(
      new RequestBodyTooLargeError(4),
    );
    expect(request.readableEnded).toBe(false);
  });

  it("returns a body at the byte limit", async () => {
    const result = await readBoundedRequestBody(
      incomingBody(["ab", "cd"], { "transfer-encoding": "chunked" }),
      4,
    );

    expect(new TextDecoder().decode(result)).toBe("abcd");
  });

  it("rejects an oversized declared content length before consuming data", async () => {
    const request = incomingBody(["body"], { "content-length": "5" });

    await expect(readBoundedRequestBody(request, 4)).rejects.toEqual(
      new RequestBodyTooLargeError(4),
    );
    expect(request.readableEnded).toBe(false);
  });

  it("rejects chunked bodies when their accumulated bytes exceed the limit", async () => {
    await expect(
      readBoundedRequestBody(
        incomingBody(["ab", "cde"], { "transfer-encoding": "chunked" }),
        4,
      ),
    ).rejects.toEqual(new RequestBodyTooLargeError(4));
  });

  it.each(["GET", "HEAD", "OPTIONS"])(
    "caps an unexpected %s request body before routing",
    async (method) => {
      await expect(
        readBoundedRequestBody(
          incomingBody(["abcde"], { "content-length": "5" }, method),
          4,
        ),
      ).rejects.toEqual(new RequestBodyTooLargeError(4));
    },
  );

  it("times out a partially received body", async () => {
    const request = new Readable({ read() {} }) as IncomingMessage;
    request.method = "POST";
    request.headers = { "content-length": "2" };
    request.push("{");

    await expect(readBoundedRequestBody(request, 4, 10)).rejects.toEqual(
      new RequestBodyTimeoutError(10),
    );
    request.destroy();
  });
});
