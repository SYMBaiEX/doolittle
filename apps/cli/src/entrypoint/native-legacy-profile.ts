import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { importLegacySettings } from "@doolittle/agent/services/session/legacy-profile";
import {
  type ProfileMigration,
  readLegacyDesktopProfile,
  restoreLegacyDesktopConversations,
} from "@doolittle/desktop/legacy-profile-source";
import { readRegularFileSync } from "@doolittle/storage";
import { writeJsonAtomicSync } from "@elizaos/core";

const HISTORY_IMPORT_BUDGET_MS = 2_000;

export function defaultLegacyDesktopProfile(): string | undefined {
  const home = homedir();
  const { APPDATA, XDG_CONFIG_HOME } = process.env;
  const parent =
    process.platform === "darwin"
      ? join(home, "Library", "Application Support")
      : process.platform === "win32"
        ? APPDATA
        : XDG_CONFIG_HOME && isAbsolute(XDG_CONFIG_HOME)
          ? XDG_CONFIG_HOME
          : join(home, ".config");
  if (!parent || !isAbsolute(parent)) return undefined;
  try {
    return join(realpathSync(parent), "Doolittle");
  } catch {
    return undefined;
  }
}

function overlaps(a: string, b: string): boolean {
  const inside = (base: string, child: string) => {
    const path = relative(base, child);
    return (
      !isAbsolute(path) &&
      path !== ".." &&
      !path.startsWith("../") &&
      !path.startsWith("..\\")
    );
  };
  return inside(a, b) || inside(b, a);
}

/** Prepares the allowlisted preferences before bootstrap and imports chats once the lead identity is ready. */
export function prepareLegacyProfileMigration(
  root: string,
  destination: string,
  workspace: string,
):
  | {
      finish(lead: { id: string; name: string }): ProfileMigration;
    }
  | undefined {
  if (overlaps(root, destination)) return undefined;
  const marker = join(destination, "legacy-desktop-profile-v1.json");
  const report: ProfileMigration = {
    importedConversations: 0,
    skippedConversations: 0,
    settingsImported: false,
    deferred: false,
  };
  try {
    let markerBytes: Buffer | undefined;
    try {
      markerBytes = readRegularFileSync(marker, 64, { singleLink: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (markerBytes?.toString("utf8").replace(/\s/gu, "") === '{"version":1}')
      return undefined;
    const source = readLegacyDesktopProfile(root, workspace);
    if (!source) return undefined;
    if (source.isLastWorkspace) {
      try {
        report.settingsImported = importLegacySettings(
          source.runtimeDataDir,
          destination,
        );
      } catch {
        report.deferred = true;
      }
    }
    return {
      finish(lead) {
        const deadline = performance.now() + HISTORY_IMPORT_BUDGET_MS;
        try {
          restoreLegacyDesktopConversations({
            source,
            destination,
            workspace,
            lead,
            report,
            withinBudget: () => performance.now() < deadline,
          });
          if (!report.deferred) writeJsonAtomicSync(marker, { version: 1 });
        } catch {
          report.deferred = true;
        }
        return report;
      },
    };
  } catch {
    report.deferred = true;
    return { finish: () => report };
  }
}
