import { describe, expect, it } from "vitest";
import { compileBrowserEvidenceContext } from "./browser-feedback";

describe("browser evidence context", () => {
  it("builds an escaped, bounded structured handoff with the browser receipt", () => {
    const context = compileBrowserEvidenceContext({
      result: {
        action: "capture",
        title: "Page <capture>",
        payload: {
          capture: {
            captureMode: "rendered-page",
            status: { captureReady: true },
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

    expect(context).toContain('capture_mode="rendered-page"');
    expect(context).toContain('pixel_evidence="available"');
    expect(context).toContain("&lt;checkout&gt;");
    expect(context).toContain("contrast &amp; spacing");
    expect(context).toContain("<artifact>/tmp/screenshot.png</artifact>");
    expect(context).toContain("</browser_evidence>");
  });

  it.each(["capture-card", "pixel", "raster", "browser", "screenshot"])(
    "never promotes %s PNG artifacts or legacy readiness into rendered evidence",
    (captureMode) => {
      const context = compileBrowserEvidenceContext({
        result: {
          action: "capture",
          title: "Capture card",
          payload: {
            capture: {
              captureMode,
              status: { captureReady: true },
              screenshotPath: "/tmp/card.png",
            },
          },
        },
        url: "https://example.test",
        viewport: "desktop",
      });
      expect(context).toContain('pixel_evidence="false"');
      expect(context).toContain(
        "Do not infer or claim pixel-level visual evidence.",
      );
    },
  );

  it.each([
    { captureMode: "rendered-page", screenshotPath: "/tmp/page.png" },
    {
      captureMode: "rendered-page",
      status: { captureReady: false },
      screenshotPath: "/tmp/page.png",
    },
    { captureMode: "rendered-page", status: { captureReady: true } },
  ])("rejects incomplete rendered receipts %j", (capture) => {
    const context = compileBrowserEvidenceContext({
      result: { action: "capture", title: "Capture", payload: { capture } },
      url: "https://example.test",
      viewport: "desktop",
    });
    expect(context).toContain('pixel_evidence="false"');
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
