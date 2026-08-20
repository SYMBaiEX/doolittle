import { Search } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiIcon } from "./UiIcon";

describe("UiIcon", () => {
  it("renders decorative icons consistently and hides them from assistive tech", () => {
    const markup = renderToStaticMarkup(<UiIcon icon={Search} />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("size-3.5");
    expect(markup).toContain("stroke-[1.8]");
  });

  it("exposes the optional label for standalone informative icons", () => {
    const markup = renderToStaticMarkup(
      <UiIcon icon={Search} label="Search status" size="md" />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Search status"');
    expect(markup).not.toContain("aria-hidden");
  });
});
