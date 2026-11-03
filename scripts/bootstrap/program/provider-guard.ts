import { readOptionalJson } from "../../../packages/storage/src/index";

/** Headless setup must not silently replace a saved, removed provider. */
export function assertHeadlessProviderAvailable(settingsPath: string): void {
  const settings = readOptionalJson<{ model?: { provider?: unknown } }>(
    settingsPath,
  );
  if (settings?.model?.provider === "devin") {
    throw new Error(
      "The saved provider is Devin, which has been removed. Run interactive setup to choose a supported provider; headless setup will not replace this route.",
    );
  }
}
