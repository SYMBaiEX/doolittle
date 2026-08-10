import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Notice } from "./lib";

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
