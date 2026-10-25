import { lstatSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { readRegularFileSync } from "../utils/read-regular-file";
import { normalizeRuntimeSettings } from "./settings/normalization";
import { setSettingPath } from "./settings/path";
import type {
  ParsedRuntimeSettings,
  RuntimeSettings,
} from "./settings/runtime-settings";

export type { RuntimeSettings } from "./settings/runtime-settings";

const MAX_SETTINGS_BYTES = 1024 * 1024;

export class SettingsService {
  private readonly filePath: string;
  private readonly defaults: RuntimeSettings;
  // Read-through cache keyed by file identity and metadata. get() is called
  // several times per turn; cache hits avoid JSON parsing and normalization.
  // Returned values are cloned so callers cannot mutate canonical settings.
  private cache?: { key: string; settings: RuntimeSettings };

  constructor(baseDir: string, defaults: RuntimeSettings) {
    mkdirSync(baseDir, { recursive: true, mode: 0o700 });
    this.filePath = join(baseDir, "settings.json");
    this.defaults = defaults;
    if (!this.fileExists()) {
      this.write(defaults);
    }
  }

  get(): RuntimeSettings {
    const key = this.fileKey();
    const cached = this.cache;
    if (cached && cached.key === key) {
      return structuredClone(cached.settings);
    }
    const raw = readRegularFileSync(this.filePath, MAX_SETTINGS_BYTES, {
      singleLink: true,
    }).toString("utf8");
    const parsed = JSON.parse(raw) as ParsedRuntimeSettings;
    const { dirty, settings } = normalizeRuntimeSettings(parsed, this.defaults);
    if (dirty) {
      // write() refreshes the cache with the post-write mtime.
      this.write(settings);
    } else {
      this.cache = { key, settings };
    }
    return structuredClone(settings);
  }

  set(path: string, value: unknown): RuntimeSettings {
    return this.setMany([{ path, value }]);
  }

  setMany(
    changes: ReadonlyArray<{ path: string; value: unknown }>,
  ): RuntimeSettings {
    const settings = this.get();
    for (const change of changes) {
      setSettingPath(settings, change.path, change.value);
    }
    const normalized = normalizeRuntimeSettings(
      settings,
      this.defaults,
    ).settings;
    this.write(normalized);
    return normalized;
  }

  private write(settings: RuntimeSettings): void {
    if (
      Buffer.byteLength(JSON.stringify(settings, null, 2), "utf8") >
      MAX_SETTINGS_BYTES
    ) {
      throw new Error("Settings file exceeds its byte limit.");
    }
    writeJsonAtomicSync(this.filePath, settings);
    this.cache = { key: this.fileKey(), settings: structuredClone(settings) };
  }

  private fileExists(): boolean {
    try {
      lstatSync(this.filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private fileKey(): string {
    const info = lstatSync(this.filePath);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      info.size > MAX_SETTINGS_BYTES
    ) {
      throw new Error("Settings file is not a bounded private regular file.");
    }
    return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  }
}
