// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";

const reply = (body: string, status = 200) => ({
  body,
  status,
  statusText: "",
  headers: { "content-type": "application/json" },
});
afterEach(() => {
  vi.unstubAllGlobals();
});
function bridge(
  requestAgent: ReturnType<typeof vi.fn>,
  cancelAgentRequest = vi.fn().mockResolvedValue(undefined),
) {
  Object.defineProperty(window, "doolittle", {
    configurable: true,
    value: { requestAgent, cancelAgentRequest },
  });
  return cancelAgentRequest;
}
it("keeps bot and workspace ownership on the IPC request and parses JSON", async () => {
  const request = vi.fn().mockResolvedValue(reply('{"ok":true}'));
  bridge(request);
  await expect(
    desktopRequest("/api/status", "GET", undefined, undefined, 5000, "bot-a", {
      botId: "bot-a",
      originConversationId: "chat-a",
      workspacePath: "/project-a",
    }),
  ).resolves.toEqual({ ok: true });
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: "/api/status",
      botId: "bot-a",
      originConversationId: "chat-a",
      workspacePath: "/project-a",
    }),
  );
  await expect(
    desktopRequest("https://outside.example/api/status"),
  ).rejects.toThrow("local agent URLs");
  expect(request).toHaveBeenCalledOnce();
});
it("preserves host error codes and never retries failed mutations", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(
      reply('{"error":"Cancelled","code":"bot_activation_cancelled"}', 409),
    );
  bridge(request);
  await expect(
    desktopRequest("/api/bots/start", "POST", {}),
  ).rejects.toMatchObject({
    status: 409,
    code: "bot_activation_cancelled",
    message: "Cancelled",
  });
  expect(request).toHaveBeenCalledOnce();
});
it("cancels IPC on caller abort and on timeout even with a caller signal", async () => {
  const request = vi.fn(() => new Promise(() => {}));
  const cancel = bridge(request);
  const controller = new AbortController();
  const first = desktopRequest(
    "/api/status",
    "GET",
    undefined,
    controller.signal,
  );
  controller.abort();
  await expect(first).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
  await expect(
    desktopRequest(
      "/api/status",
      "GET",
      undefined,
      new AbortController().signal,
      5,
    ),
  ).rejects.toThrow();
  expect(cancel).toHaveBeenCalledTimes(2);
});
