import { afterEach, describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { bindPluginStorage } from "./types/storage";

const originalDataDir = process.env.DOOLITTLE_DATA_DIR;

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.DOOLITTLE_DATA_DIR;
    return;
  }

  process.env.DOOLITTLE_DATA_DIR = originalDataDir;
});

describe("bindPluginStorage", () => {
  it("uses an injected data root when provided", () => {
    const binding = bindPluginStorage("planning", {
      dataRoot: "/tmp/doolittle-data",
    });

    expect(binding).toEqual({
      dataRoot: "/tmp/doolittle-data",
      scope: "planning",
      rootDir: "/tmp/doolittle-data/planning",
    });
  });

  it("derives the default root from DOOLITTLE_DATA_DIR when configured", () => {
    process.env.DOOLITTLE_DATA_DIR = "/tmp/runtime-state";

    const binding = bindPluginStorage("forms");

    expect(binding.dataRoot).toBe("/tmp/runtime-state/plugins");
    expect(binding.rootDir).toBe("/tmp/runtime-state/plugins/forms");
  });

  it("falls back to the user home data root when no config is present", () => {
    delete process.env.DOOLITTLE_DATA_DIR;

    const binding = bindPluginStorage("browser");

    expect(binding.dataRoot).toBe(join(homedir(), ".doolittle", "plugins"));
    expect(binding.rootDir).toBe(
      join(homedir(), ".doolittle", "plugins", "browser"),
    );
  });
});
