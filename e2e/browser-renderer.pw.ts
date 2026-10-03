import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { build } from "esbuild";
import type { RasterCase } from "../apps/desktop/e2e/browser-renderer-fixture";
import {
  pinFixtureDirectory,
  removePinnedFixtureDirectory,
  resolveFixtureCaptureBackend,
  resolveFixtureCaptureScale,
  startNativeRendererFixture,
} from "../apps/desktop/e2e/native-renderer-fixture";

const captureTransport =
  process.env.DOOLITTLE_RENDER_CAPTURE_TRANSPORT ?? "playwright";
if (captureTransport !== "playwright" && captureTransport !== "native")
  throw new Error("Unknown renderer fixture transport.");
const captureBackend = resolveFixtureCaptureBackend(
  process.env.DOOLITTLE_RENDER_CAPTURE_BACKEND,
);
const captureScale = resolveFixtureCaptureScale(
  process.env.DOOLITTLE_RENDER_CAPTURE_SCALE,
);
const expectedBackend =
  captureBackend === "product-default"
    ? process.platform === "linux"
      ? "offscreen"
      : "onscreen"
    : captureBackend;

// Fixed crossover arms distinguish a case-specific failure from the first
// invocation in a hosted Xvfb session. The default full-CI order is unchanged.
const captureOrder =
  process.env.DOOLITTLE_RENDER_CAPTURE_ORDER ?? "complete-first";
if (captureOrder !== "complete-first" && captureOrder !== "async-first")
  throw new Error("Unknown renderer fixture case order.");
const firstModes =
  captureOrder === "async-first"
    ? (["async", "complete"] as const)
    : (["complete", "async"] as const);
for (const mode of [
  ...firstModes,
  "lazy",
  "late",
  "expire-after-png",
] as const) {
  const expireAfterPng = mode === "expire-after-png";
  const rasterCase: RasterCase = expireAfterPng ? "complete" : mode;
  test(
    expireAfterPng
      ? "post-encode target expiry preserves successful PNG diagnostics"
      : `first hidden Electron PNG includes the ${mode} raster`,
    async ({ browserName }, testInfo) => {
      expect(browserName).toBe("chromium");
      const ownedDir = mkdtempSync(join(tmpdir(), "doolittle-renderer-e2e-"));
      const ownedIdentity = pinFixtureDirectory(ownedDir);
      let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
      let native: ReturnType<typeof startNativeRendererFixture> | undefined;
      let retainOwnedDir = false;
      try {
        const entry = join(ownedDir, "fixture.cjs");
        await build({
          entryPoints: [
            resolve("apps/desktop/e2e/browser-renderer-fixture.ts"),
          ],
          outfile: entry,
          bundle: true,
          platform: "node",
          format: "cjs",
          external: ["electron"],
        });
        if (captureTransport === "native") {
          retainOwnedDir = true;
          native = startNativeRendererFixture({
            entry,
            ownedDir,
            captureScale,
          });
        } else
          app = await electron.launch({
            args: [
              entry,
              `--user-data-dir=${join(ownedDir, "profile")}`,
              `--force-device-scale-factor=${captureScale}`,
            ],
            cwd: process.cwd(),
          });
        if (!native && !app) throw new Error("Fixture transport unavailable.");
        const outcome = native
          ? await native.capture(rasterCase, expireAfterPng)
          : await app?.evaluate(
              async (
                _electron,
                request: { kind: RasterCase; expireAfterPng: boolean },
              ) => {
                const fixture = await globalThis.browserRendererFixture;
                try {
                  return {
                    capture: await fixture.capture(request.kind, {
                      expireAfterPng: request.expireAfterPng,
                    }),
                    failure: null,
                  };
                } catch (error) {
                  const failure = fixture.captureFailure(error);
                  // Only the fixture's fixed, sanitized capture error crosses as a
                  // diagnostic envelope. Unknown errors retain their original path.
                  if (!failure) throw error;
                  return { capture: null, failure };
                }
              },
              { kind: rasterCase, expireAfterPng },
            );
        if (!outcome)
          throw new Error("Fixture transport returned no evidence.");
        const diagnostic = {
          mode,
          transport: captureTransport,
          backend:
            outcome.capture?.diagnostic?.backend ??
            outcome.failure?.window?.backend ??
            null,
          requestedBackend: captureBackend,
          requestedScale: captureScale,
          nativeLinuxNoSandbox:
            captureTransport === "native" && process.platform === "linux",
          order: captureOrder,
          repeatIndex: testInfo.repeatEachIndex,
          window:
            outcome.capture?.diagnostic ?? outcome.failure?.window ?? null,
          failure: outcome.failure
            ? {
                phase: outcome.failure.phase,
                status: outcome.failure.status,
                error: outcome.failure.error,
                truncated: outcome.failure.truncated,
                elapsedMs: outcome.failure.elapsedMs,
              }
            : null,
        };
        // One allowlisted record, before all capture assertions; no process logs,
        // arbitrary error text, scripts, paths, URLs, partitions or credentials.
        console.log(JSON.stringify(diagnostic));
        try {
          await testInfo.attach(`${mode}-first-capture-diagnostic`, {
            body: Buffer.from(JSON.stringify(diagnostic)),
            contentType: "application/json",
          });
        } catch (error) {
          // An artifact transport error must not replace an existing capture
          // failure. Successful captures retain ordinary attachment failures.
          if (!outcome.failure) throw error;
        }
        const assertObservedScale = () => {
          const observed =
            outcome.capture?.diagnostic ?? outcome.failure?.window;
          expect(observed?.forcedScaleFactor).toBe(captureScale);
          // Linux OSR must honor the requested sample scale; DPR-range and
          // PNG-to-actual-DPR checks alone cannot prove the four scale arms.
          // Keep the original cross-platform onscreen contract on Mac/Windows.
          if (process.platform === "linux" && expectedBackend === "offscreen") {
            expect(observed?.factsViewport?.deviceScaleFactor).toBe(
              captureScale,
            );
            if (captureBackend === "product-default")
              expect(observed?.constructed?.display?.scaleFactor).toBe(
                captureScale,
              );
          }
        };
        if (expireAfterPng) {
          expect(outcome.capture).toBeNull();
          expect(outcome.failure?.status).toBe(502);
          expect(outcome.failure?.phase).toBe("first-snapshot");
          const observed = outcome.failure?.window;
          expect(observed?.backend).toBe(expectedBackend);
          expect(observed?.phase).toBe("png-encode");
          expect(observed?.failedPhase).toBeNull();
          expect(observed?.nativeCapture?.settlement).toBe("fulfilled");
          expect(observed?.nativeCapture?.failure).toBeNull();
          expect(observed?.nativeCapture?.durationMs).toBeGreaterThanOrEqual(0);
          expect(observed?.png?.bytes).toBeGreaterThan(0);
          expect(observed?.png?.ihdr?.width).toBeGreaterThan(0);
          expect(observed?.png?.ihdr?.height).toBeGreaterThan(0);
          assertObservedScale();
          expect(observed?.calls).toEqual({
            executeJavaScript: 2,
            waitForRender: 1,
            renderedFacts: 1,
            capturePage: 1,
            pngEncode: 1,
          });
          return;
        }
        if (outcome.failure)
          throw new Error(
            `Fixture capture failed: ${JSON.stringify(outcome.failure)}`,
          );
        const capture = outcome.capture;
        if (!capture) throw new Error("Fixture capture returned no evidence.");
        expect(capture.diagnostic?.backend).toBe(expectedBackend);
        expect(capture.diagnostic?.nativeCapture?.settlement).toBe("fulfilled");
        expect(capture.diagnostic?.nativeCapture?.failure).toBeNull();
        expect(
          capture.diagnostic?.nativeCapture?.durationMs,
        ).toBeGreaterThanOrEqual(0);
        expect(capture.diagnostic?.calls).toEqual({
          executeJavaScript: 2,
          waitForRender: 1,
          renderedFacts: 1,
          capturePage: 1,
          pngEncode: 1,
        });
        assertObservedScale();
        expect(capture.diagnostic?.png?.ihdr).toEqual({
          width: capture.width,
          height: capture.height,
        });
        await testInfo.attach(`${mode}-first-png`, {
          body: Buffer.from(capture.png, "base64"),
          contentType: "image/png",
        });
        await testInfo.attach(`${mode}-pixel-contract`, {
          body: Buffer.from(
            JSON.stringify({
              viewport: capture.viewport,
              factsViewport: capture.factsViewport,
              pngWidth: capture.width,
              pngHeight: capture.height,
              bitmapBytes: capture.bitmapBytes,
              sentinelBGRA: capture.sentinelBGRA,
            }),
          ),
          contentType: "application/json",
        });
        expect(capture.captureMode).toBe("rendered-page");
        expect(capture.viewport).toEqual({ width: 1280, height: 720 });
        expect(capture.factsViewport.width).toBe(capture.viewport.width);
        expect(capture.factsViewport.height).toBe(capture.viewport.height);
        const scale = capture.factsViewport.deviceScaleFactor;
        expect(Number.isFinite(scale)).toBe(true);
        expect(scale).toBeGreaterThanOrEqual(1);
        expect(scale).toBeLessThanOrEqual(4);
        // Same PNG/CSS/DPR contract as the rendered-capture consumer; do not assume
        // every platform exports a Retina-sized bitmap because of a launch flag.
        expect(
          Math.abs(capture.width - capture.viewport.width * scale),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(capture.height - capture.viewport.height * scale),
        ).toBeLessThanOrEqual(1);
        expect(capture.bitmapBytes).toBe(capture.width * capture.height * 4);
        expect(capture.hidden).toBe(true);
        expect(capture.privatePartition).toBe(true);
        expect(capture.blockedRequests).toBe(0);
        expect(capture.images).toEqual([
          { alt: "Owned synthetic raster", loaded: true },
        ]);
        // The fixture raster is red with low green; the blank sage background is
        // BGRA [153,187,170,255]. DOM loaded=true alone would pass the buggy bridge.
        expect(capture.sentinelBGRA[2]).toBeGreaterThan(240);
        expect(capture.sentinelBGRA[1]).toBeLessThan(140);
        expect(capture.sentinelBGRA[3]).toBe(255);
      } finally {
        try {
          if (app) {
            try {
              await app.evaluate(async () => {
                const fixture = await globalThis.browserRendererFixture;
                await fixture.dispose();
              });
            } finally {
              await app.close();
            }
          }
        } finally {
          if (native) retainOwnedDir = !(await native.dispose());
          if (!retainOwnedDir) removePinnedFixtureDirectory(ownedIdentity);
        }
      }
    },
  );
}
