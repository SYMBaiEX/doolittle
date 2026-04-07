import type { SettingsService } from "../../settings-service";

export type RuntimeSettingsSnapshot = ReturnType<SettingsService["get"]>;
export type SettingsSetter = SettingsService["set"];
