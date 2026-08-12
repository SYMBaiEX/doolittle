import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MEDIA_RESULT_CHARACTER_LIMIT, MediaResult } from "./MediaResult";

describe("MediaResult", () => {
  it("keeps media output bounded in one shared presentation", () => {
    const markup = renderToStaticMarkup(
      <MediaResult
        eyebrow="Analysis result"
        result={{ output: "x".repeat(MEDIA_RESULT_CHARACTER_LIMIT + 200) }}
        title="Model output"
      />,
    );
    expect(markup).toContain("Analysis result");
    expect(markup).toContain("Model output");
    expect(markup).toContain("more chars");
    expect(markup).toContain('aria-live="polite"');
  });
});
