import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArtifactViewer } from "./ArtifactViewer";

describe("ArtifactViewer", () => {
  it("renders a compact Tailwind-only artifact disclosure", () => {
    const markup = renderToStaticMarkup(
      <ArtifactViewer
        artifacts={[{ index: 0, name: "release.diff" }]}
        runId="run-1"
      />,
    );

    expect(markup).toContain("release.diff");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(markup).not.toContain("artifact-viewer");
  });
});
