import { createServer } from "node:http";
import { app, BrowserWindow, nativeImage, session } from "electron";
import {
  type BrowserRenderBridge,
  startBrowserRenderBridge,
} from "../src/main/browser-renderer";

export type RasterCase = "complete" | "async" | "lazy" | "late";

export interface RasterCapture {
  png: string;
  width: number;
  height: number;
  sentinelBGRA: number[];
  hidden: boolean;
  privatePartition: boolean;
  blockedRequests: number;
  captureMode: string;
  images: { alt: string; loaded: boolean }[];
}

interface Fixture {
  capture(mode: RasterCase): Promise<RasterCapture>;
  dispose(): Promise<void>;
}

declare global {
  var browserRendererFixture: Promise<Fixture>;
}

// This dedicated main entry never boots the desktop application or providers.
// Playwright supplies a freshly owned --user-data-dir and closes it in finally.
app.on("window-all-closed", () => {});

globalThis.browserRendererFixture = (async () => {
  await app.whenReady();
  const size = 4096;
  const bitmap = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      bitmap[offset] = (x * 17 + y * 37) % 256;
      bitmap[offset + 1] = (x * 13 + y * 11) % 128;
      bitmap[offset + 2] = 255;
      bitmap[offset + 3] = 255;
    }
  }
  const raster = nativeImage
    .createFromBitmap(bitmap, { width: size, height: size })
    .toPNG();
  const server = createServer((request, response) => {
    if (request.url === "/raster.png") {
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      response.end(raster);
      return;
    }
    const mode = new URL(request.url ?? "/", "http://fixture").searchParams.get(
      "case",
    );
    if (!["complete", "async", "lazy", "late"].includes(mode ?? "")) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
    const image = `<img alt="Owned synthetic raster" src="/raster.png" decoding="${mode === "complete" ? "sync" : "async"}" ${mode === "lazy" ? 'loading="lazy"' : ""}>`;
    response.end(`<!doctype html><title>Owned raster fixture</title>
      <style>body{margin:0;background:#aabb99}img{width:640px;height:640px;object-fit:cover}</style>
      <main>${mode === "late" ? "" : image}</main>
      ${mode === "late" ? `<script>addEventListener('load',()=>setTimeout(()=>{const image=new Image();image.alt='Owned synthetic raster';image.decoding='async';image.src='/raster.png';document.querySelector('main').append(image)},75))</script>` : ""}`);
  });
  let bridge: BrowserRenderBridge | undefined;
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await bridge?.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Fixture did not obtain a loopback port.");
    const origin = `http://127.0.0.1:${address.port}`;
    bridge = await startBrowserRenderBridge({
      isManagedAppUrl: async (url) => url.origin === origin,
    });
    const base = bridge.environment.ELIZA_BROWSER_WORKSPACE_URL;
    const headers = {
      Authorization: `Bearer ${bridge.environment.ELIZA_BROWSER_WORKSPACE_TOKEN}`,
      "Content-Type": "application/json",
    };
    return {
      dispose,
      async capture(mode) {
        const opened = await fetch(`${base}/tabs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            url: `${origin}/?case=${mode}`,
            width: 1280,
            height: 720,
          }),
        });
        if (!opened.ok)
          throw new Error(`Fixture open failed: ${opened.status}`);
        const { tab } = (await opened.json()) as {
          tab: { id: string; partition: string };
        };
        try {
          // Exactly one snapshot request: retrying would hide the original race.
          const response = await fetch(`${base}/tabs/${tab.id}/snapshot`, {
            headers,
          });
          if (!response.ok)
            throw new Error(`First fixture capture failed: ${response.status}`);
          const capture = (await response.json()) as {
            data: string;
            captureMode: string;
            blockedRequests: number;
            facts: { images: RasterCapture["images"] };
          };
          const rendered = nativeImage.createFromBuffer(
            Buffer.from(capture.data, "base64"),
          );
          const { width, height } = rendered.getSize();
          const pixels = rendered.toBitmap();
          const offset =
            (Math.floor((height * 300) / 720) * width +
              Math.floor((width * 300) / 1280)) *
            4;
          const windows = BrowserWindow.getAllWindows();
          return {
            png: capture.data,
            width,
            height,
            sentinelBGRA: [...pixels.subarray(offset, offset + 4)],
            hidden:
              windows.length === 1 &&
              windows.every((window) => !window.isVisible()),
            privatePartition:
              windows.length === 1 &&
              tab.partition === `doolittle-capture-${tab.id}` &&
              windows.every(
                (window) =>
                  window.webContents.session !== session.defaultSession,
              ),
            blockedRequests: capture.blockedRequests,
            captureMode: capture.captureMode,
            images: capture.facts.images,
          };
        } finally {
          await fetch(`${base}/tabs/${tab.id}`, { method: "DELETE", headers });
        }
      },
    } satisfies Fixture;
  } catch (error) {
    await dispose();
    throw error;
  }
})();
