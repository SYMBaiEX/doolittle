import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InlineActionConfirmation } from "./InlineActionConfirmation";

describe("InlineActionConfirmation", () => {
  it("explains the action and makes cancellation available", () => {
    const markup = renderToStaticMarkup(
      <InlineActionConfirmation
        busy={false}
        busyLabel="Deleting…"
        confirmLabel="Confirm delete"
        detail="This stops future triggers."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Morning brief?"
      />,
    );

    expect(markup).toContain("<fieldset");
    expect(markup).toContain("Delete Morning brief?");
    expect(markup).toContain("This stops future triggers.");
    expect(markup).toContain("Confirm delete");
    expect(markup).toContain("Cancel");
  });

  it("locks both choices and exposes busy state", () => {
    const markup = renderToStaticMarkup(
      <InlineActionConfirmation
        busy
        busyLabel="Approving…"
        confirmLabel="Confirm approve"
        detail="Allow future messages."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Approve sender?"
        tone="primary"
      />,
    );

    expect(markup).toContain("Approving…");
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/disabled=""/gu)).toHaveLength(2);
    expect(markup).toContain("inline-action-confirmation mt-2.5 grid");
    expect(markup).toContain("var(--accent)_26%");
  });
});
