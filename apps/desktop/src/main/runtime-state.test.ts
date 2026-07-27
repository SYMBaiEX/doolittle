import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureDesktopRuntimeState } from "./runtime-state";

describe("ensureDesktopRuntimeState", () => {
  it("copies source onboarding and settings without overwriting desktop state", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-desktop-state-"));
    const source = resolve(root, "source");
    const desktop = resolve(root, "desktop");
    try {
      mkdirSync(source, { recursive: true });
      writeFileSync(resolve(source, "onboarding.json"), '{"source":true}');
      writeFileSync(
        resolve(source, "settings.json"),
        '{"model":{"provider":"ollama"}}',
      );
      ensureDesktopRuntimeState(desktop, source);

      expect(readFileSync(resolve(desktop, "settings.json"), "utf8")).toContain(
        "ollama",
      );
      writeFileSync(resolve(desktop, "onboarding.json"), '{"desktop":true}');
      ensureDesktopRuntimeState(desktop, source);
      expect(readFileSync(resolve(desktop, "onboarding.json"), "utf8")).toBe(
        '{"desktop":true}',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("seeds a standalone desktop onboarding receipt", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-desktop-state-"));
    try {
      ensureDesktopRuntimeState(root);
      const receipt = JSON.parse(
        readFileSync(resolve(root, "onboarding.json"), "utf8"),
      );
      expect(receipt.mode).toBe("desktop");
      expect(receipt.profile).toBe("desktop-first-run");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
