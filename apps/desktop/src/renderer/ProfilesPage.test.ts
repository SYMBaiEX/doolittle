import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./ProfilesPage.tsx", import.meta.url),
  "utf8",
);

describe("ProfilesPage density", () => {
  it("surfaces only the selected identity state and keeps switching secondary", () => {
    expect(source).toContain(
      'eyebrow: isActive ? "Active identity" : undefined',
    );
    expect(source).toContain('className="secondary-button"');
    expect(source).not.toContain('status: isActive ? "Active" : "Available"');
    expect(source).not.toContain('"Available identity"');
    expect(source).not.toContain('className={isActive ? "secondary-button"');
  });
});
