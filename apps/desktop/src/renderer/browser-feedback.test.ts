import { describe, expect, it } from "bun:test";
import { compileBrowserEvidenceContext } from "./browser-feedback";

describe("browser evidence context", () => {
  it("builds an escaped, bounded structured handoff with the browser receipt", () => {
    const context = compileBrowserEvidenceContext({
      result: {
        action: "capture",
        title: "Page <capture>",
        payload: {
          capture: {
            captureMode: "raster",
            page: { title: "Storefront", url: "https://example.test/path?a=1" },
            screenshotPath: "/tmp/screenshot.png",
          },
        },
      },
      url: "https://example.test/path?a=1",
      viewport: "mobile",
      selector: "main > a[href='<checkout>']",
      region: "Header CTA",
      comment: "Check contrast & spacing.",
    });

    expect(context).toContain('capture_mode="raster"');
    expect(context).toContain('pixel_evidence="available"');
    expect(context).toContain("&lt;checkout&gt;");
    expect(context).toContain("contrast &amp; spacing");
    expect(context).toContain("<artifact>/tmp/screenshot.png</artifact>");
    expect(context).toContain("</browser_evidence>");
  });

  it("never represents placeholder captures as pixel evidence", () => {
    const context = compileBrowserEvidenceContext({
      result: {
        action: "inspect",
        title: "Inspect",
        payload: {
          capture: {
            captureMode: "placeholder",
            status: { captureReady: false },
          },
        },
      },
      url: "https://example.test",
      viewport: "desktop",
      limit: 1_000,
    });

    expect(context).toContain('pixel_evidence="false"');
    expect(context).toContain(
      "Do not infer or claim pixel-level visual evidence.",
    );
    expect(context.length).toBeLessThanOrEqual(1_000);
  });

  it("requires an explicit browser-backed mode before claiming pixel evidence", () => {
    const context = compileBrowserEvidenceContext({
      result: {
        action: "inspect",
        title: "Structured result",
        payload: { inspection: { captureMode: "structured" } },
      },
      url: "https://example.test",
      viewport: "responsive",
    });

    expect(context).toContain('pixel_evidence="false"');
    expect(context).toContain(
      "Do not infer or claim pixel-level visual evidence.",
    );
  });
});
