import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const requireFromRoot = createRequire(resolve(root, "package.json"));
const computerUsePackage = requireFromRoot(
  "@elizaos/plugin-computeruse/package.json",
) as { version: string };
const requireFromComputerUse = createRequire(
  requireFromRoot.resolve("@elizaos/plugin-computeruse/package.json"),
);

describe("computer-use Puppeteer security override", () => {
  it("pins only the computer-use plugin to the compatible patched Puppeteer release", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    ) as {
      overrides?: Record<string, string>;
    };

    expect(
      packageJson.overrides?.["@elizaos/plugin-computeruse>puppeteer-core"],
    ).toBe("25.8.0");
    expect(computerUsePackage.version).toBe("2.0.3-beta.7");
  });

  it("keeps the computer-use browser entry points importable without extract-zip", async () => {
    const puppeteerPackage = requireFromComputerUse(
      "puppeteer-core/package.json",
    ) as { version: string };
    expect(puppeteerPackage.version).toBe("25.8.0");
    expect(() =>
      requireFromComputerUse.resolve("extract-zip/package.json"),
    ).toThrow();

    const puppeteer = await import(
      requireFromComputerUse.resolve("puppeteer-core")
    );
    expect(typeof puppeteer.default.launch).toBe("function");
    expect(typeof puppeteer.connect).toBe("function");

    const computerUse = await import(
      requireFromRoot.resolve("@elizaos/plugin-computeruse")
    );
    expect(typeof computerUse.default).toBe("object");
  });
});
