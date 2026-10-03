import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { build } from "esbuild";
import type { RasterCase } from "../apps/desktop/e2e/browser-renderer-fixture";

for (const mode of [
  "complete",
  "async",
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
      let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
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
        app = await electron.launch({
          args: [
            entry,
            `--user-data-dir=${join(ownedDir, "profile")}`,
            "--force-device-scale-factor=2",
          ],
          cwd: process.cwd(),
        });
        const outcome = await app.evaluate(
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
        const diagnostic = {
          mode,
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
        if (expireAfterPng) {
          expect(outcome.capture).toBeNull();
          expect(outcome.failure?.status).toBe(502);
          expect(outcome.failure?.phase).toBe("first-snapshot");
          const observed = outcome.failure?.window;
          expect(observed?.phase).toBe("png-encode");
          expect(observed?.failedPhase).toBeNull();
          expect(observed?.png?.bytes).toBeGreaterThan(0);
          expect(observed?.png?.ihdr?.width).toBeGreaterThan(0);
          expect(observed?.png?.ihdr?.height).toBeGreaterThan(0);
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
          rmSync(ownedDir, { recursive: true, force: true });
        }
      }
    },
  );
}
