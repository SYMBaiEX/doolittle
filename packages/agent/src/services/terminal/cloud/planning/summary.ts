import type { RuntimeSettings } from "../../../settings/runtime-settings";
import type { CloudExecutionProvider, CloudPlanningSummary } from "../types";
import { buildDaytonaCloudPlanningSummary } from "./daytona";
import { buildModalCloudPlanningSummary } from "./modal";

export function buildCloudPlanningSummary(
  provider: CloudExecutionProvider,
  settings: RuntimeSettings,
  workspacePath: string,
): CloudPlanningSummary {
  return provider === "daytona"
    ? buildDaytonaCloudPlanningSummary(settings, workspacePath)
    : buildModalCloudPlanningSummary(settings, workspacePath);
}

export function buildCloudProfile(
  provider: CloudExecutionProvider,
  settings: RuntimeSettings,
  workspacePath: string,
) {
  return buildCloudPlanningSummary(provider, settings, workspacePath).profile;
}
