import { describe, expect, it } from "vitest";
import {
  buildBrowserResultViewModel,
  collectBrowserArtifactPaths,
  getBrowserEvidenceMetadata,
} from "./browser-result-model";

describe("browser result model", () => {
  const payload = {
    capture: {
      captureMode: "raster",
      status: { captureReady: true },
      page: {
        contentLength: 420,
        title: "Storefront",
        url: "https://example.test/store",
      },
      screenshotPath: "/tmp/storefront.png",
    },
    response: "Review the primary action contrast.",
  };

  it("shares capture metadata and artifact extraction with the result view", () => {
    expect(getBrowserEvidenceMetadata(payload)).toEqual({
      artifactPaths: ["/tmp/storefront.png"],
      captureMode: "raster",
      captureReady: true,
      pageTitle: "Storefront",
      url: "https://example.test/store",
    });
    expect(collectBrowserArtifactPaths(payload)).toEqual([
      "/tmp/storefront.png",
    ]);

    const model = buildBrowserResultViewModel({
      action: "capture",
      title: "Capture result",
      payload,
    });

    expect(model.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Page", value: "Storefront" }),
        expect.objectContaining({ label: "Capture", value: "Raster" }),
      ]),
    );
    expect(model.artifacts).toContainEqual({
      label: "Capture screenshot",
      value: "/tmp/storefront.png",
    });
  });

  it("only accepts safe image previews and bounds a raw payload", () => {
    const model = buildBrowserResultViewModel({
      action: "inspect",
      title: "Inspect result",
      payload: {
        inspection: { page: { url: "https://example.test" } },
        image: "https://example.test/preview.png",
        unsafe: "javascript:alert(1)",
        long: "x".repeat(13_000),
      },
    });

    expect(model.previews).toEqual([
      { label: "Image", src: "https://example.test/preview.png" },
    ]);
    expect(model.rawTruncated).toBe(true);
  });

  it("uses comparison analysis when the root comparison is absent or empty", () => {
    const comparison = {
      left: { page: { title: "Before", url: "https://before.test" } },
      right: { page: { title: "After", url: "https://after.test" } },
      manifestPath: "/tmp/comparison.json",
      reportPath: "/tmp/comparison.md",
      summary: { hashChanged: true, wordDelta: 14 },
    };

    for (const rootComparison of [undefined, {}]) {
      const model = buildBrowserResultViewModel({
        action: "compare-analyze",
        title: "Comparison analysis",
        payload: {
          ...(rootComparison === undefined
            ? {}
            : { comparison: rootComparison }),
          analysis: { comparison },
        },
      });

      expect(model.cards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "Compare left", value: "Before" }),
          expect.objectContaining({ label: "Compare right", value: "After" }),
          expect.objectContaining({
            label: "Diff",
            value: "Content changed",
            detail: "+14 words",
          }),
        ]),
      );
      expect(model.artifacts).toEqual(
        expect.arrayContaining([
          { label: "Comparison manifest", value: "/tmp/comparison.json" },
          { label: "Comparison report", value: "/tmp/comparison.md" },
        ]),
      );
    }
  });
});
