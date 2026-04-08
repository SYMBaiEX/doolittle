import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeRuntimeSettings } from "@/services/settings/normalization";
import type {
  ParsedRuntimeSettings,
  RuntimeSettings,
} from "@/services/settings/runtime-settings";

export type { RuntimeSettings } from "@/services/settings/runtime-settings";

export class SettingsService {
  private readonly filePath: string;
  private readonly defaults: RuntimeSettings;

  constructor(baseDir: string, defaults: RuntimeSettings) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "settings.json");
    this.defaults = defaults;
    if (!existsSync(this.filePath)) {
      this.write(defaults);
    }
  }

  get(): RuntimeSettings {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as ParsedRuntimeSettings;
    const { dirty, settings } = normalizeRuntimeSettings(parsed, this.defaults);
    if (dirty) {
      this.write(settings);
    }
    return settings;
  }

  set(path: string, value: unknown): RuntimeSettings {
    const settings = this.get();
    const segments = path.split(".");
    let current = settings as unknown as Record<string, unknown>;

    while (segments.length > 1) {
      const segment = segments.shift();
      if (!segment) {
        break;
      }
      const next = current[segment];
      if (!next || typeof next !== "object") {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    const leaf = segments[0];
    current[leaf] = value;
    this.write(settings);
    return settings;
  }

  private write(settings: RuntimeSettings): void {
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2), "utf8");
  }
}
