import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectEditor, shouldHandleDialogKey } from "./ProjectManager";

describe("ProjectManager dialog layers", () => {
  it("suspends the parent Escape and Tab trap while a nested editor owns focus", () => {
    expect(shouldHandleDialogKey("Escape", true)).toBe(false);
    expect(shouldHandleDialogKey("Tab", true)).toBe(false);
    expect(shouldHandleDialogKey("Escape", false)).toBe(true);
    expect(shouldHandleDialogKey("Tab", false)).toBe(true);
  });

  it("renders the project editor as a labeled modal dialog", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectEditor, {
        onClose: vi.fn(),
        onSubmit: vi.fn(),
        saving: false,
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toMatch(/aria-labelledby="[^"]+"/u);
    expect(markup).toContain('aria-label="Close project editor"');
  });
});
