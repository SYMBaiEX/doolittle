import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResourceState } from "./ResourceState";

describe("ResourceState", () => {
  it("renders the shared loading state", () => {
    const markup = renderToStaticMarkup(
      <ResourceState error="" loading retry={vi.fn()} />,
    );
    expect(markup).toContain("Loading workbench…");
    expect(markup).toContain('role="status"');
  });

  it("renders retryable errors and stays empty when ready", () => {
    const retry = vi.fn();
    const errorMarkup = renderToStaticMarkup(
      <ResourceState
        error="Runtime unavailable"
        loading={false}
        retry={retry}
      />,
    );
    expect(errorMarkup).toContain("Runtime unavailable");
    expect(errorMarkup).toContain("Try again");
    expect(
      renderToStaticMarkup(
        <ResourceState error="" loading={false} retry={retry} />,
      ),
    ).toBe("");
  });
});
