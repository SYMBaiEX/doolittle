import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const keysPage = readFileSync(
  new URL("./KeysPage.tsx", import.meta.url),
  "utf8",
);
const keysCss = readFileSync(new URL("./keys.css", import.meta.url), "utf8");
describe("keys workspace layout", () => {
  it("removes the unused inventory column only after an empty response", () => {
    expect(keysPage).toContain(
      "!secrets.loading && !secrets.error && keys.length === 0",
    );
    expect(keysPage).toContain('inventoryEmpty ? " is-empty" : ""');
    expect(keysPage).toContain("{inventoryEmpty ? null : (");
    expect(keysPage).toContain("No stored keys. Save the first credential");
    expect(keysPage).toContain('import "./keys.css"');
    expect(keysCss).toContain("width: min(100%, 1120px)");
    expect(keysCss).toContain(
      "grid-template-columns: minmax(180px, 0.42fr) minmax(0, 1.58fr)",
    );
    expect(keysCss).toContain(
      "grid-template-columns: minmax(220px, 0.65fr) minmax(0, 1.35fr)",
    );
    expect(keysCss).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
