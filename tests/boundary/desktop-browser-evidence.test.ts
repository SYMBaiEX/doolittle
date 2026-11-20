import { expect, it } from "vitest";
import { compileBrowserEvidenceContext } from "../../apps/desktop/src/renderer/browser-feedback";
import type { BrowserResult } from "../../apps/desktop/src/renderer/browser-result-model";

const result: BrowserResult = {
  id: "capture-1",
  action: "capture",
  title: "Capture result",
  payload: { capture: { page: { url: "https://example.com/redirected" } } },
  requestedUrl: "http://127.0.0.1:3000/start",
  previewSize: "mobile",
};

it("uses the captured page URL and original preview size for a browser receipt", () => {
  const evidence = compileBrowserEvidenceContext({ result });
  expect(evidence).toContain('url="https://example.com/redirected"');
  expect(evidence).toContain('preview_size="mobile"');
  expect(evidence).not.toContain(result.requestedUrl);
});

it("keeps both captured comparison targets and treats the viewport note as an annotation", () => {
  const evidence = compileBrowserEvidenceContext({
    result: {
      ...result,
      action: "compare",
      comparisonUrl: "https://example.com/comparison",
      payload: {},
    },
    viewportNote: "Narrow <layout>",
  });

  expect(evidence).toContain(`url="${result.requestedUrl}"`);
  expect(evidence).toContain(
    "<comparison_url>https://example.com/comparison</comparison_url>",
  );
  expect(evidence).toContain(
    "<viewport_note>Narrow &lt;layout&gt;</viewport_note>",
  );
});
