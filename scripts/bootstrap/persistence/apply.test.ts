import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createHeadlessAnswers } from "../answers";
import { applyBootstrapAnswers } from "./apply";

vi.mock("../answers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../answers")>();
  return {
    ...actual,
    buildNativeOnboardingMirror: async () => ({
      serialized: { step: "SKILLS", version: 1 },
      complete: true,
      currentStep: "SKILLS",
      summary: "ready",
    }),
  };
});

describe("applyBootstrapAnswers", () => {
  it("atomically persists all bootstrap JSON outputs with two-space formatting", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-bootstrap-apply-"));
    const paths = {
      envPath: join(root, ".env"),
      settingsPath: join(root, ".doolittle", "settings.json"),
      gatewayPath: join(root, ".doolittle", "gateway", "gateway.json"),
      onboardingPath: join(root, ".doolittle", "onboarding.json"),
      nativeOnboardingPath: join(root, ".doolittle", "onboarding.state.json"),
    };

    try {
      writeFileSync(paths.envPath, "DOOLITTLE_NAME=\n", "utf8");
      const answers = createHeadlessAnswers(
        new Map([
          ["DOOLITTLE_NAME", "Bootstrap test"],
          ["OPENAI_API_KEY", "test-key"],
        ]),
      );

      await applyBootstrapAnswers(answers, paths, {
        checkOnly: false,
        headless: true,
        skipWizard: false,
      });

      const expectedOutputs = [
        [
          paths.settingsPath,
          (value: unknown) =>
            expect(value).toMatchObject({ model: { provider: "openai" } }),
        ],
        [
          paths.gatewayPath,
          (value: unknown) =>
            expect(value).toMatchObject({
              platforms: { api: { enabled: true } },
            }),
        ],
        [
          paths.onboardingPath,
          (value: unknown) =>
            expect(value).toMatchObject({
              provider: "openai",
              mode: "headless",
            }),
        ],
        [
          paths.nativeOnboardingPath,
          (value: unknown) =>
            expect(value).toEqual({ step: "SKILLS", version: 1 }),
        ],
      ] as const;

      for (const [path, assertOutput] of expectedOutputs) {
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, "utf8");
        expect(content).toBe(JSON.stringify(JSON.parse(content), null, 2));
        assertOutput(JSON.parse(content));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
