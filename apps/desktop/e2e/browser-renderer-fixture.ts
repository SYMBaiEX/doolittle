import { createServer } from "node:http";
import {
  app,
  BrowserWindow,
  nativeImage,
  type RenderProcessGoneDetails,
  session,
} from "electron";
import {
  type BrowserRenderBridge,
  startBrowserRenderBridge,
} from "../src/main/browser-renderer";

export type RasterCase = "complete" | "async" | "lazy" | "late";

export interface RasterCapture {
  png: string;
  width: number;
  height: number;
  viewport: { width: number; height: number };
  factsViewport: { width: number; height: number; deviceScaleFactor: number };
  bitmapBytes: number;
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

interface WindowDiagnostic {
  loaded: boolean;
  closed: boolean;
  unresponsive: boolean;
  mainFrameLoadErrorCode: number | null;
  renderProcessGone: RenderProcessGoneDetails | null;
}

async function fixtureErrorBody(response: Response) {
  // Only this fixture's private loopback bridge is queried. Bound reads and
  // allowlist its fixed error messages; never echo arbitrary body/URL/header data.
  const reader = response.body?.getReader();
  if (!reader) return { error: "empty-error-body", truncated: false };
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  try {
    while (bytes < 1024) {
      const { value, done } = await reader.read();
      if (done) break;
      const remaining = 1024 - bytes;
      chunks.push(Buffer.from(value.subarray(0, remaining)));
      bytes += Math.min(value.length, remaining);
      if (value.length >= remaining) {
        truncated = true;
        break;
      }
    }
  } catch {
    return { error: "unreadable-error-body", truncated };
  } finally {
    // Diagnostic transport errors must not replace the original failing status.
    await reader.cancel().catch(() => {});
  }
  let error = "unrecognized-error-body";
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      [
        "Rendered evidence could not be captured.",
        "The managed app could not be rendered.",
        "The managed app is no longer available in this workspace.",
        "Capture bridge authorization is required.",
      ].includes(body?.error)
    )
      error = body.error;
  } catch {
    // Keep malformed/unknown body contents out of test diagnostics.
  }
  return { error, truncated };
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
  let windowDiagnostic: WindowDiagnostic | undefined;
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
      createWindow(options) {
        const window = new BrowserWindow(options);
        const diagnostic: WindowDiagnostic = {
          loaded: false,
          closed: false,
          unresponsive: false,
          mainFrameLoadErrorCode: null,
          renderProcessGone: null,
        };
        windowDiagnostic = diagnostic;
        window.on("closed", () => {
          diagnostic.closed = true;
        });
        window.on("unresponsive", () => {
          diagnostic.unresponsive = true;
        });
        window.webContents.on("did-finish-load", () => {
          diagnostic.loaded = true;
        });
        window.webContents.on(
          "did-fail-load",
          (_event, code, _description, _url, mainFrame) => {
            if (mainFrame) diagnostic.mainFrameLoadErrorCode = code;
          },
        );
        window.webContents.on("render-process-gone", (_event, details) => {
          diagnostic.renderProcessGone = {
            reason: details.reason,
            exitCode: details.exitCode,
          };
        });
        return window;
      },
    });
    const base = bridge.environment.ELIZA_BROWSER_WORKSPACE_URL;
    const headers = {
      Authorization: `Bearer ${bridge.environment.ELIZA_BROWSER_WORKSPACE_TOKEN}`,
      "Content-Type": "application/json",
    };
    return {
      dispose,
      async capture(mode) {
        const startedAt = Date.now();
        const failed = async (
          phase: "open" | "first-snapshot",
          response: Response,
        ) => {
          const body = await fixtureErrorBody(response);
          return new Error(
            `Fixture capture failed: ${JSON.stringify({ phase, status: response.status, ...body, elapsedMs: Date.now() - startedAt, window: windowDiagnostic ?? null })}`,
          );
        };
        const opened = await fetch(`${base}/tabs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            url: `${origin}/?case=${mode}`,
            width: 1280,
            height: 720,
          }),
        });
        if (!opened.ok) throw await failed("open", opened);
        const { tab } = (await opened.json()) as {
          tab: { id: string; partition: string };
        };
        try {
          // Exactly one snapshot request: retrying would hide the original race.
          const response = await fetch(`${base}/tabs/${tab.id}/snapshot`, {
            headers,
          });
          if (!response.ok) throw await failed("first-snapshot", response);
          const capture = (await response.json()) as {
            data: string;
            captureMode: string;
            blockedRequests: number;
            viewport: RasterCapture["viewport"];
            facts: {
              images: RasterCapture["images"];
              viewport: RasterCapture["factsViewport"];
            };
          };
          const png = Buffer.from(capture.data, "base64");
          if (
            png.length < 33 ||
            !png
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
            png.toString("ascii", 12, 16) !== "IHDR"
          )
            throw new Error("Fixture capture did not return a PNG.");
          // Validate actual IHDR pixels, not the host's Retina configuration or
          // NativeImage's selected representation. Sample in this PNG's bitmap.
          const width = png.readUInt32BE(16);
          const height = png.readUInt32BE(20);
          const rendered = nativeImage.createFromBuffer(png, {
            scaleFactor: 1,
          });
          const bitmapSize = rendered.getSize(1);
          const pixels = rendered.toBitmap({ scaleFactor: 1 });
          if (
            bitmapSize.width !== width ||
            bitmapSize.height !== height ||
            pixels.length !== width * height * 4
          )
            throw new Error("Fixture PNG/bitmap dimensions disagree.");
          const offset =
            (Math.floor((height * 300) / capture.viewport.height) * width +
              Math.floor((width * 300) / capture.viewport.width)) *
            4;
          const windows = BrowserWindow.getAllWindows();
          return {
            png: capture.data,
            width,
            height,
            viewport: capture.viewport,
            factsViewport: capture.facts.viewport,
            bitmapBytes: pixels.length,
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
