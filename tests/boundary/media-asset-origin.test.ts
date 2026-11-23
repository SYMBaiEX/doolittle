import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HandlerCallback, IAgentRuntime, Memory } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { createMediaActions } from "../../packages/agent/src/actions/media-action";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { runWithConversationWorkspace } from "../../packages/agent/src/runtime/workspace-scope";
import { handleMediaRoutes } from "../../packages/agent/src/server/routes/media";
import { MediaService } from "../../packages/agent/src/services/media/service";

function mediaActionFixture() {
  const generateImage = vi.fn(async () => ({
    artifactPath: "assets/image.png",
    manifestPath: "assets/image.json",
    provider: "fixture",
    model: "fixture-model",
  }));
  const [action] = createMediaActions({
    media: { generateImage } as unknown as MediaService,
  });
  if (!action) throw new Error("Missing image action");
  return {
    generateImage,
    run: (
      callback?: HandlerCallback,
      signal?: AbortSignal,
      prompt = "Blue lake",
    ) =>
      action.handler(
        {} as IAgentRuntime,
        { content: {} } as Memory,
        undefined,
        { parameters: { prompt }, abortSignal: signal },
        callback,
      ),
  };
}

it("keeps generated media and calls a failing delivery callback only once", async () => {
  const { run, generateImage } = mediaActionFixture();
  const callback = vi
    .fn<HandlerCallback>()
    .mockRejectedValueOnce(new Error("Delivery failed"));
  await expect(run(callback)).resolves.toMatchObject({
    success: true,
    text: "Generated image: assets/image.png",
    userFacingText: "Generated image: assets/image.png",
    verifiedUserFacing: true,
    data: {
      artifactPath: "assets/image.png",
      manifestPath: "assets/image.json",
      provider: "fixture",
      model: "fixture-model",
      callbackDelivery: "failed",
    },
  });
  expect(generateImage).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledTimes(1);
});

it("returns successful media with or without a callback", async () => {
  const { run } = mediaActionFixture();
  const callback = vi.fn<HandlerCallback>().mockResolvedValue([]);
  await expect(run(callback)).resolves.toMatchObject({ success: true });
  expect(callback).toHaveBeenCalledExactlyOnceWith({
    text: "Generated image: assets/image.png",
    source: "doolittle-media-action",
  });
  await expect(run()).resolves.toMatchObject({ success: true });
});

it("reports generation and missing-input errors without retrying delivery", async () => {
  const { run, generateImage } = mediaActionFixture();
  generateImage.mockRejectedValueOnce(new Error("Provider failed"));
  const callback = vi
    .fn<HandlerCallback>()
    .mockRejectedValueOnce(new Error("Delivery failed"));
  await expect(run(callback)).resolves.toMatchObject({
    success: false,
    text: "Media operation failed: Provider failed",
    data: { callbackDelivery: "failed" },
  });
  expect(callback).toHaveBeenCalledTimes(1);
  await expect(run(undefined, undefined, "")).resolves.toMatchObject({
    success: false,
    text: "Media action requires a prompt.",
  });
  expect(generateImage).toHaveBeenCalledTimes(1);
});

it.each(["operation", "delivery", "signal"])(
  "propagates media cancellation during %s without a second callback",
  async (stage) => {
    const { run, generateImage } = mediaActionFixture();
    const controller = new AbortController();
    const error = new Error("Cancelled");
    if (stage !== "signal") error.name = "AbortError";
    const callback = vi.fn<HandlerCallback>().mockImplementation(async () => {
      if (stage === "signal") controller.abort(error);
      throw error;
    });
    if (stage === "operation") generateImage.mockRejectedValueOnce(error);
    await expect(run(callback, controller.signal)).rejects.toBe(error);
    expect(callback).toHaveBeenCalledTimes(stage === "operation" ? 0 : 1);
  },
);

it("attributes generated images and speech to the trusted conversation and previews scoped results", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-asset-origin-"));
  const output = join(root, "assets");
  try {
    const media = new MediaService(root, output);
    const context = { services: { media } } as AppContext;
    const call = (path: string) => {
      const url = new URL(path, "http://localhost");
      return handleMediaRoutes(context, new Request(url), url);
    };
    const scope = {
      botId: "scout",
      sessionId: "chat-123",
      workspacePath: root,
    };
    await runWithConversationWorkspace(scope, async () => {
      await media.generateImage("Blue lake");
      await media.speak("Read the agenda", { format: "svg" });
    });
    await media.generateImage("Unscoped export");
    const response = await call("/media/library?sessionId=chat-123");
    if (!response) throw new Error("The asset list route did not match.");
    expect(response.status).toBe(200);
    const { assets } = (await response.json()) as {
      assets: ReturnType<typeof media.listLibraryAssets>;
    };
    expect(assets.map(({ prompt }) => prompt).sort()).toEqual([
      "Blue lake",
      "Read the agenda",
    ]);
    expect(
      assets.every(
        ({ origin }) =>
          origin?.botId === "scout" && origin.sessionId === "chat-123",
      ),
    ).toBe(true);
    expect(media.listLibraryAssets()).toHaveLength(3);
    expect(media.listLibraryAssets("other-chat")).toEqual([]);
    const preview = await call(`/media/library/${assets[0]?.id}`);
    expect(preview?.status).toBe(200);
    expect(await preview?.json()).toMatchObject({
      asset: { origin: { botId: "scout", sessionId: "chat-123" } },
      encoding: "base64",
    });
    rmSync(output, { recursive: true });
    expect((await call("/media/library"))?.status).toBe(503);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
