import { Buffer } from "node:buffer";
import type { ChatMessage, ChatMessageContentPart } from "@elizaos/core";
import { CodexBackend } from "@elizaos/plugin-codex-cli";
import { describe, expect, it, vi } from "vitest";

// The public SDK backend owns serialization, OAuth, SSE and tool correlation.
// No private translator imports, live credentials, local-file reads or network.
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
  "base64",
);
const pngUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;

function fixture() {
  const requests: Array<Record<string, unknown>> = [];
  const loadAuth = vi.fn(async () => ({
    OPENAI_API_KEY: null,
    auth_mode: "chatgpt" as const,
    last_refresh: "",
    tokens: {
      id_token: "synthetic-id",
      access_token: "synthetic-access",
      refresh_token: "synthetic-refresh",
      account_id: "synthetic-account",
    },
  }));
  const fetchImpl = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        'data: {"type":"response.output_text.delta","delta":"synthetic result"}\n\n' +
          'data: {"type":"response.completed","response":{"stop_reason":"stop"}}\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  );
  const backend = new CodexBackend({
    model: "configured-model",
    jitterMaxMs: 0,
    loadAuth,
    fetchImpl,
  });
  return { backend, requests, loadAuth, fetchImpl };
}

describe("pinned SDK Codex image-input patch", () => {
  it("transmits ordered text and multiple images without duplicating the prompt", async () => {
    const f = fixture();
    const messages: ChatMessage[] = [
      { role: "system", content: "Preserve system instructions" },
      {
        role: "user",
        content: [
          { type: "text", text: "Before" },
          { type: "image", image: pngUrl },
          { type: "text", text: "After" },
          { type: "image", image: new URL("https://images.example/test.png") },
        ],
      },
    ];
    const snapshot = JSON.stringify(messages);
    const result = await f.backend.generate({
      prompt: "Before\nAfter",
      messages,
    });
    expect(result.text).toBe("synthetic result");
    expect(f.requests).toEqual([
      {
        model: "configured-model",
        instructions: "Preserve system instructions",
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: "Before" },
              { type: "input_image", image_url: pngUrl, detail: "auto" },
              { type: "input_text", text: "After" },
              {
                type: "input_image",
                image_url: "https://images.example/test.png",
                detail: "auto",
              },
            ],
          },
        ],
        store: false,
        stream: true,
      },
    ]);
    expect(JSON.stringify(messages)).toBe(snapshot);
  });

  it.each([
    ["typed bytes", pngBytes, "image/png"],
    ["inferred PNG bytes", new Uint8Array(pngBytes), undefined],
    ["base64 with MIME", pngBytes.toString("base64"), "image/png"],
    ["data URL", pngUrl, undefined],
  ])(
    "sends %s as a real image-only input",
    async (_label, image, mediaType) => {
      const f = fixture();
      await f.backend.generate({
        prompt: "",
        messages: [
          { role: "user", content: [{ type: "image", image, mediaType }] },
        ],
      });
      expect(f.requests[0]?.input).toEqual([
        {
          type: "message",
          role: "user",
          content: [{ type: "input_image", image_url: pngUrl, detail: "auto" }],
        },
      ]);
    },
  );

  it.each([
    ["local path", { type: "image", image: "/private/screenshot.png" }],
    [
      "file URL",
      { type: "image", image: new URL("file:///private/screenshot.png") },
    ],
    [
      "credential URL",
      { type: "image", image: "https://private:secret@images.example/a" },
    ],
    ["unsupported protocol", { type: "image", image: "javascript:alert(1)" }],
    [
      "empty bytes",
      { type: "image", image: new Uint8Array(), mediaType: "image/png" },
    ],
    ["unknown bytes", { type: "image", image: new Uint8Array([1, 2, 3]) }],
    [
      "unsupported MIME",
      { type: "image", image: pngBytes, mediaType: "image/svg+xml" },
    ],
    [
      "malformed base64",
      { type: "image", image: "data:image/png;base64,invalid!" },
    ],
    ["empty data URL", { type: "image", image: "data:image/png;base64," }],
    [
      "MIME mismatch",
      { type: "image", image: pngUrl, mediaType: "image/jpeg" },
    ],
    ["invalid object", { type: "image", image: {} }],
    ["invalid MIME type", { type: "image", image: pngBytes, mediaType: 123 }],
  ])("fails closed for %s before auth or fetch", async (_label, part) => {
    const f = fixture();
    await expect(
      f.backend.generate({
        prompt: "inspect",
        messages: [{ role: "user", content: [part as ChatMessageContentPart] }],
      }),
    ).rejects.toThrow("Unsupported Codex image input");
    expect(f.loadAuth).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.requests).toEqual([]);
  });

  it.each(["system", "developer", "assistant", "tool"] as const)(
    "rejects images in the unsupported %s role rather than silently dropping them",
    async (role) => {
      const f = fixture();
      await expect(
        f.backend.generate({
          prompt: "inspect",
          messages: [{ role, content: [{ type: "image", image: pngUrl }] }],
        }),
      ).rejects.toThrow("Codex image input requires a user message");
      expect(f.loadAuth).not.toHaveBeenCalled();
      expect(f.fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["image/jpeg", new Uint8Array([255, 216, 255, 224])],
    ["image/gif", new Uint8Array(Buffer.from("GIF89a"))],
    ["image/webp", new Uint8Array(Buffer.from("RIFF0000WEBP"))],
  ])(
    "infers %s from binary signatures without a local read",
    async (mime, image) => {
      const f = fixture();
      await f.backend.generate({
        prompt: "",
        messages: [{ role: "user", content: [{ type: "image", image }] }],
      });
      expect(f.requests[0]?.input).toEqual([
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: `data:${mime};base64,${Buffer.from(image).toString("base64")}`,
              detail: "auto",
            },
          ],
        },
      ]);
    },
  );

  it("releases the SDK request queue after image validation fails", async () => {
    const f = fixture();
    const invalid = f.backend.generate({
      prompt: "",
      messages: [
        {
          role: "user",
          content: [{ type: "image", image: "file:///private/image.png" }],
        },
      ],
    });
    const next = f.backend.generate({ prompt: "Next" });
    await expect(invalid).rejects.toThrow("Unsupported Codex image input");
    await expect(next).resolves.toMatchObject({ text: "synthetic result" });
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]?.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Next" }],
      },
    ]);
  });

  it("preserves text-only grouping, assistant tool deduplication and call/result correlation", async () => {
    const f = fixture();
    await f.backend.generate({
      prompt: "Next",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "One" },
            { type: "text", text: "Two" },
          ],
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Inspecting" },
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "inspect",
              args: {},
            },
          ],
          toolCalls: [{ id: "call-1", name: "inspect", arguments: {} }],
        },
        { role: "tool", toolCallId: "call-1", content: "Observed" },
        {
          role: "user",
          content: [
            { type: "text", text: "Next" },
            { type: "image", image: pngUrl },
          ],
        },
      ],
    });
    expect(f.requests[0]?.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "One\nTwo" }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Inspecting" }],
      },
      {
        type: "function_call",
        call_id: "call-1",
        name: "inspect",
        arguments: "{}",
      },
      { type: "function_call_output", call_id: "call-1", output: "Observed" },
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "Next" },
          { type: "input_image", image_url: pngUrl, detail: "auto" },
        ],
      },
    ]);
  });
});
