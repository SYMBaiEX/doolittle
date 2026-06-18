import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
  // Read-through cache keyed by file mtime. get() is called several times per
  // turn; this turns the per-call readFileSync + JSON.parse + normalize into a
  // single cheap statSync on cache hits. Returned values are cloned so callers
  // can never mutate the cached canonical settings.
  private cache?: { mtimeMs: number; settings: RuntimeSettings };

  constructor(baseDir: string, defaults: RuntimeSettings) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "settings.json");
    this.defaults = defaults;
    if (!existsSync(this.filePath)) {
      this.write(defaults);
    }
  }

  get(): RuntimeSettings {
    const mtimeMs = statSync(this.filePath).mtimeMs;
    const cached = this.cache;
    if (cached && cached.mtimeMs === mtimeMs) {
      return structuredClone(cached.settings);
    }
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as ParsedRuntimeSettings;
    const { dirty, settings } = normalizeRuntimeSettings(parsed, this.defaults);
    if (dirty) {
      // write() refreshes the cache with the post-write mtime.
      this.write(settings);
    } else {
      this.cache = { mtimeMs, settings };
    }
    return structuredClone(settings);
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
    this.cache = { mtimeMs: statSync(this.filePath).mtimeMs, settings };
  }
}
