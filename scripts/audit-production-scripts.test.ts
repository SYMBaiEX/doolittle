import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const expectedNetworkPolicy = [
  "--fetch-timeout 15000",
  "--fetch-retries 2",
  "--fetch-retry-factor 2",
  "--fetch-retry-mintimeout 250",
  "--fetch-retry-maxtimeout 1000",
];

describe("production audit scripts", () => {
  it.each(["audit:production:critical", "audit:production:high"])(
    "keeps %s fail-closed and bounded",
    (name) => {
      const manifest = JSON.parse(
        readFileSync(resolve(root, "package.json"), "utf8"),
      ) as { scripts: Record<string, string> };
      const command = manifest.scripts[name];

      expect(command).toContain("nub audit --production --audit-level");
      expect(command).not.toContain("--ignore-registry-errors");
      for (const option of expectedNetworkPolicy) {
        expect(command).toContain(option);
      }
    },
  );

  it("runs the bounded critical audit from acceptance", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(manifest.scripts["check:acceptance"]).toContain(
      "nub run audit:production:critical",
    );
  });
});
