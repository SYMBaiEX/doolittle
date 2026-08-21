import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const keysPage = readFileSync(
  new URL("./KeysPage.tsx", import.meta.url),
  "utf8",
);
describe("keys workspace layout", () => {
  it("uses the shared page shell instead of owning route geometry", () => {
    expect(keysPage).toContain('const KEYS_PAGE_CLASS = "page gap-4"');
    expect(keysPage).not.toContain("w-[min(100%,1380px)]");
    expect(keysPage).not.toContain("px-[clamp(24px,4vw,58px)]");
    expect(keysPage).not.toContain("pt-[34px]");
    expect(keysPage).not.toContain("pb-[54px]");
  });

  it("removes the unused inventory column only after an empty response", () => {
    expect(keysPage).toContain(
      "!secrets.loading && !secrets.error && keys.length === 0",
    );
    expect(keysPage).toContain("data-inventory-empty");
    expect(keysPage).toContain("{inventoryEmpty ? null : (");
    expect(keysPage).toContain("No stored keys. Save the first credential");
    expect(keysPage).toContain(
      "w-[min(100%,1120px)] flex-none self-center grid-cols-1",
    );
    expect(keysPage).toContain(
      "grid-cols-[minmax(180px,0.42fr)_minmax(0,1.58fr)]",
    );
    expect(keysPage).toContain(
      "grid-cols-[minmax(220px,0.65fr)_minmax(0,1.35fr)]",
    );
    expect(keysPage).toContain("max-[800px]:grid-cols-1");
  });

  it("intrinsically stacks a populated inventory before its editor is crushed", () => {
    expect(keysPage).toContain(
      "grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))]",
    );
    expect(keysPage).toContain("max-h-[min(36svh,360px)]");
    expect(keysPage).not.toContain(
      "grid-cols-[minmax(240px,0.36fr)_minmax(0,1fr)]",
    );
    expect(keysPage).not.toContain("min-h-[610px]");
  });
});
