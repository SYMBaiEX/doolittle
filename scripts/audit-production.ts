import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parse, stringify } from "yaml";
import { readWorkspaces } from "./workspaces";

type LockedDependency = { specifier: string; version: string };
type Importer = {
  dependencies?: Record<string, LockedDependency>;
  optionalDependencies?: Record<string, LockedDependency>;
};
export interface ProductionAuditReport {
  error?: unknown;
  advisories: Record<
    string,
    { severity?: string; url?: string; vulnerable_versions?: string }
  >;
  metadata: { dependencies: number; totalDependencies?: number };
}

/** Nub audits only the current lockfile importer. Preserve exact snapshots while
 * projecting every workspace's production roots into isolated audit importers. */
export function productionAuditScopes(source: string, directories: string[]) {
  const start = source.indexOf("\nimporters:\n") + 1;
  const end = source.indexOf("\npackages:\n") + 1;
  if (start <= 0 || end <= start)
    throw new Error("Unsupported Nub lockfile importer layout.");
  const { importers } = parse(source.slice(start, end)) as {
    importers: Record<string, Importer>;
  };
  const scopes: Array<Record<string, LockedDependency>> = [];
  for (const directory of [".", ...directories]) {
    const importer = importers[directory];
    if (!importer)
      throw new Error(`Missing locked workspace importer: ${directory}`);
    for (const [name, entry] of Object.entries({
      ...importer.dependencies,
      ...importer.optionalDependencies,
    })) {
      if (typeof entry.version !== "string")
        throw new Error(`Invalid locked dependency: ${directory}/${name}`);
      // Local packages contribute their own external production dependencies.
      if (entry.version.startsWith("link:")) continue;
      let scope = scopes.find(
        (candidate) =>
          !candidate[name] || candidate[name].version === entry.version,
      );
      if (!scope) {
        scope = {};
        scopes.push(scope);
      }
      scope[name] = entry;
    }
  }
  if (!scopes.length)
    throw new Error(
      "No production dependency roots were found; refusing an empty audit.",
    );
  return scopes.map((dependencies) => ({
    dependencies,
    lockfile:
      source.slice(0, start) +
      stringify({ importers: { ".": { dependencies } } }) +
      "\n" +
      source.slice(end),
  }));
}

export function auditProductionWorkspaces(
  root: string,
  level = "low",
): ProductionAuditReport[] {
  const scopes = productionAuditScopes(
    readFileSync(resolve(root, "nub.lock"), "utf8"),
    readWorkspaces(root).map((workspace) => workspace.directory),
  );
  return scopes.map((scope, index) => {
    const directory = mkdtempSync(
      resolve(tmpdir(), "doolittle-production-audit-"),
    );
    try {
      writeFileSync(resolve(directory, "nub.lock"), scope.lockfile);
      writeFileSync(
        resolve(directory, "package.json"),
        JSON.stringify({
          name: "doolittle-production-audit",
          version: "1.0.0",
          private: true,
          dependencies: Object.fromEntries(
            Object.entries(scope.dependencies).map(([name, entry]) => [
              name,
              entry.specifier,
            ]),
          ),
        }),
      );
      const result = spawnSync(
        "nub",
        [
          "audit",
          "--production",
          "--audit-level",
          level,
          "--json",
          "--fetch-timeout",
          "15000",
          "--fetch-retries",
          "2",
          "--fetch-retry-mintimeout",
          "250",
          "--fetch-retry-maxtimeout",
          "1000",
        ],
        {
          cwd: directory,
          encoding: "utf8",
          timeout: 60_000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      if (
        result.error ||
        result.signal ||
        (result.status !== 0 && result.status !== 1) ||
        !result.stdout.trim()
      )
        throw new Error(
          `Workspace production audit failed: ${result.error?.message ?? result.stderr.trim()}`,
        );
      const report = JSON.parse(result.stdout) as ProductionAuditReport;
      if (
        report.error ||
        !report.advisories ||
        !(report.metadata?.dependencies > 0)
      )
        throw new Error(
          "Production audit did not inspect a nonempty dependency graph.",
        );
      console.log(
        `Audited production scope ${index + 1}/${scopes.length}: ${Object.keys(scope.dependencies).length} locked dependency roots, ${report.metadata.totalDependencies ?? "unknown"} lockfile packages.`,
      );
      return report;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

if (import.meta.main) {
  const level = process.argv[2] ?? "critical";
  const levels = ["info", "low", "moderate", "high", "critical"];
  if (!levels.includes(level)) throw new Error(`Invalid audit level: ${level}`);
  const findings = auditProductionWorkspaces(process.cwd(), level)
    .flatMap((report) => Object.values(report.advisories))
    .filter(
      (advisory) =>
        levels.indexOf(advisory.severity ?? "critical") >=
        levels.indexOf(level),
    );
  if (findings.length) {
    console.error(
      `${findings.length} production advisories at or above ${level}.`,
    );
    process.exitCode = 1;
  } else console.log(`No production advisories at or above ${level}.`);
}
