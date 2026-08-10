import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationDeleteConfirmation } from "./AutomationsPage";

describe("AutomationDeleteConfirmation", () => {
  it("makes the safe choice the default and explains the consequence", () => {
    const markup = renderToStaticMarkup(
      <AutomationDeleteConfirmation
        automationName="Morning brief"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(markup).toContain("<fieldset");
    expect(markup).toContain("Delete Morning brief?");
    expect(markup).toContain("stops future triggers");
    expect(markup).toContain("Confirm delete");
    expect(markup).toContain("Keep automation");
  });

  it("locks both choices while deletion is running", () => {
    const markup = renderToStaticMarkup(
      <AutomationDeleteConfirmation
        automationName="Morning brief"
        busy
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(markup).toContain("Deleting…");
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/disabled=""/gu)).toHaveLength(2);
  });
});
