import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { build } from "esbuild";
import type { RasterCase } from "../apps/desktop/e2e/browser-renderer-fixture";

for (const mode of ["complete", "async", "lazy", "late"] as const) {
  test(`first hidden Electron PNG includes the ${mode} raster`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    const ownedDir = mkdtempSync(join(tmpdir(), "doolittle-renderer-e2e-"));
    let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
    try {
      const entry = join(ownedDir, "fixture.cjs");
      await build({
        entryPoints: [resolve("apps/desktop/e2e/browser-renderer-fixture.ts")],
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
      const capture = await app.evaluate(
        async (_electron, kind: RasterCase) => {
          const fixture = await globalThis.browserRendererFixture;
          return fixture.capture(kind);
        },
        mode,
      );
      await testInfo.attach(`${mode}-first-png`, {
        body: Buffer.from(capture.png, "base64"),
        contentType: "image/png",
      });
      expect(capture.captureMode).toBe("rendered-page");
      expect(capture.width).toBe(2560);
      expect(capture.height).toBe(1440);
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
  });
}
