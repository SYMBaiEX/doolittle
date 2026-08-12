import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyBlock, Notice, RawDataDisclosure } from "./lib";

describe("EmptyBlock density", () => {
  it("offers a compact inventory state without changing the default treatment", () => {
    const compact = renderToStaticMarkup(
      <EmptyBlock density="compact" title="No activity yet">
        Activity will appear here.
      </EmptyBlock>,
    );
    const defaultState = renderToStaticMarkup(
      <EmptyBlock title="Choose a file">Select a workspace file.</EmptyBlock>,
    );

    expect(compact).toContain("empty-block--compact");
    expect(defaultState).toMatch(/class="[^"]*\bempty-block\b[^"]*"/);
    expect(defaultState).not.toContain("empty-block--compact");
  });
});

describe("Notice announcements", () => {
  it("announces normal action feedback politely and errors assertively", () => {
    const status = renderToStaticMarkup(<Notice>Settings saved.</Notice>);
    const alert = renderToStaticMarkup(
      <Notice tone="bad">Settings could not be saved.</Notice>,
    );

    expect(status).toContain('role="status"');
    expect(status).toContain('aria-atomic="true"');
    expect(alert).toContain('role="alert"');
  });

  it("supports persistent informational notices without announcements", () => {
    const markup = renderToStaticMarkup(
      <Notice announce="off" tone="warn">
        Values remain local.
      </Notice>,
    );

    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain('role="alert"');
  });
});

describe("RawDataDisclosure", () => {
  it("does not format or mount a closed diagnostic payload", () => {
    const html = renderToStaticMarkup(
      <RawDataDisclosure
        label="Inspect response"
        value={{ privateDiagnosticMarker: "hidden-until-open" }}
      />,
    );

    expect(html).toContain("Inspect response");
    expect(html).toContain("Inspect");
    expect(html).not.toContain("privateDiagnosticMarker");
    expect(html).not.toContain("hidden-until-open");
    expect(html).not.toContain("json-preview");
  });

  it("renders a bounded preview when explicitly opened by default", () => {
    const html = renderToStaticMarkup(
      <RawDataDisclosure
        defaultOpen
        label="Inspect response"
        value={{ ready: true }}
      />,
    );

    expect(html).toContain("json-preview");
    expect(html).toContain("&quot;ready&quot;: true");
    expect(html).toContain("characters");
  });
});
