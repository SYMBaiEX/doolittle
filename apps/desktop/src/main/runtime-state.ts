import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DESKTOP_STATE_FILES = [
  "onboarding.json",
  "onboarding.state.json",
  "settings.json",
] as const;

export function ensureDesktopRuntimeState(
  runtimeDataDir: string,
  sourceDataDir?: string,
): void {
  mkdirSync(runtimeDataDir, { recursive: true });

  if (sourceDataDir) {
    for (const fileName of DESKTOP_STATE_FILES) {
      const source = resolve(sourceDataDir, fileName);
      const destination = resolve(runtimeDataDir, fileName);
      if (existsSync(source) && !existsSync(destination)) {
        copyFileSync(source, destination);
      }
    }
  }

  const onboardingPath = resolve(runtimeDataDir, "onboarding.json");
  if (!existsSync(onboardingPath)) {
    writeFileSync(
      onboardingPath,
      `${JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          mode: "desktop",
          provider: null,
          profile: "desktop-first-run",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
}
