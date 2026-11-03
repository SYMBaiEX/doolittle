import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { resolveHeadlessProviderMode } from "../../scripts/bootstrap/answers/headless";
import { assertHeadlessProviderAvailable } from "../../scripts/bootstrap/program/provider-guard";
import { resolveInteractiveProviderDefault } from "../../scripts/bootstrap/wizard/state";

it("keeps legacy Devin-only configurations dormant rather than choosing a new provider", () => {
  const env = new Map([["DOOLITTLE_USE_LINKED_DEVIN_AUTH", "true"]]);
  expect(resolveHeadlessProviderMode(env)).toBe("offline");
  expect(resolveInteractiveProviderDefault(env)).toBe("offline");
});

it("recognizes a newly configured provider despite an old Devin flag", () => {
  const env = new Map([
    ["DOOLITTLE_USE_LINKED_DEVIN_AUTH", "true"],
    ["OPENAI_API_KEY", "test-key"],
  ]);
  expect(resolveHeadlessProviderMode(env)).toBe("openai");
  expect(resolveInteractiveProviderDefault(env)).toBe("openai");
});

it("refuses headless setup without changing a saved Devin route", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-legacy-provider-"));
  try {
    const path = join(root, "settings.json");
    const saved = JSON.stringify({
      model: { provider: "devin", model: "old" },
    });
    writeFileSync(path, saved);
    expect(() => assertHeadlessProviderAvailable(path)).toThrow(
      /interactive setup/,
    );
    expect(readFileSync(path, "utf8")).toBe(saved);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
