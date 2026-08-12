import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const keysPage = readFileSync(
  new URL("./KeysPage.tsx", import.meta.url),
  "utf8",
);
const appPolish = readFileSync(
  new URL("./app-polish.css", import.meta.url),
  "utf8",
);

describe("keys workspace layout", () => {
  it("removes the unused inventory column only after an empty response", () => {
    expect(keysPage).toContain(
      "!secrets.loading && !secrets.error && keys.length === 0",
    );
    expect(keysPage).toContain('inventoryEmpty ? " is-empty" : ""');
    expect(keysPage).toContain("{inventoryEmpty ? null : (");
    expect(keysPage).toContain("No stored keys yet");
    expect(appPolish).toMatch(
      /\.page-keys > \.split-workspace\.is-empty\s*{[^}]*grid-template-columns:\s*1fr;/s,
    );
  });
});
