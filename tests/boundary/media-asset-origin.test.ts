import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { runWithConversationWorkspace } from "../../packages/agent/src/runtime/workspace-scope";
import { handleMediaRoutes } from "../../packages/agent/src/server/routes/media";
import { MediaService } from "../../packages/agent/src/services/media/service";

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
