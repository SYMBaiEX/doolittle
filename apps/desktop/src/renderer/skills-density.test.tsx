import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillsPage, skillsSectionForKey } from "./SkillsPage";

describe("SkillsPage density", () => {
  it("uses concise tabs and one catalog toolbar without repeating summary copy", () => {
    const markup = renderToStaticMarkup(<SkillsPage active />);

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-controls="skills-catalog-panel"');
    expect(markup.match(/role="tabpanel"/gu)).toHaveLength(2);
    expect(markup).toContain('id="skills-workshop-panel"');
    expect(markup).toContain('hidden="" id="skills-workshop-panel"');
    expect(markup).toContain('class="catalog-filter-bar flex');
    expect(markup).toContain("Loading…");
    expect(markup).not.toContain("29 available");
    expect(markup).not.toContain("Review before activation</small>");
  });

  it("wraps keyboard navigation and resolves Home and End deterministically", () => {
    expect(skillsSectionForKey("catalog", "ArrowLeft")).toBe("workshop");
    expect(skillsSectionForKey("workshop", "ArrowRight")).toBe("catalog");
    expect(skillsSectionForKey("workshop", "Home")).toBe("catalog");
    expect(skillsSectionForKey("catalog", "End")).toBe("workshop");
    expect(skillsSectionForKey("catalog", "Enter")).toBeUndefined();
  });
});
