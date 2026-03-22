import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BenchmarkPackRecord {
  id: string;
  title: string;
  focus: string;
  description: string;
  tags: string[];
  recommendedCommands: string[];
}

export interface DistributionChannelRecord {
  id: string;
  title: string;
  description: string;
  tags: string[];
  skillRoots: string[];
}

export interface ModelingProfileRecord {
  id: string;
  title: string;
  description: string;
  modes: string[];
  signals: string[];
}

export interface OptionalSkillPackRecord {
  slug: string;
  title: string;
  description: string;
  path: string;
  category: string;
}

export interface EcosystemSummary {
  benchmarkPacks: number;
  distributionChannels: number;
  modelingProfiles: number;
  optionalSkillPacks: number;
  packageRoots: Array<{
    label: string;
    path: string;
    exists: boolean;
  }>;
}

function readJsonFiles<T>(directory: string): T[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map(
      (entry) => JSON.parse(readFileSync(join(directory, entry), "utf8")) as T,
    );
}

function defaultPackagesRoot(): string {
  return fileURLToPath(new URL("../../../../packages/", import.meta.url));
}

function collectSkillPackRecords(rootDir: string): OptionalSkillPackRecord[] {
  if (!existsSync(rootDir)) {
    return [];
  }

  const records: OptionalSkillPackRecord[] = [];
  const stack: string[] = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    if (!current || !existsSync(current)) {
      continue;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === "SKILL.md") {
        const relative = fullPath.slice(rootDir.length + 1);
        const parts = relative.split(/[\\/]/u);
        const title = parts.at(-2)?.replace(/-/gu, " ") ?? entry.name;
        records.push({
          slug: parts.slice(0, -1).join("/"),
          title: title.replace(/\b\w/g, (letter) => letter.toUpperCase()),
          description: readFileSync(fullPath, "utf8")
            .split(/\r?\n/u)
            .slice(0, 12)
            .join("\n")
            .trim(),
          path: fullPath,
          category: parts.slice(0, -2).join("/") || "optional",
        });
      }
    }
  }

  return records.sort((left, right) => left.slug.localeCompare(right.slug));
}

export class EcosystemService {
  private readonly benchmarksDir: string;
  private readonly distributionsDir: string;
  private readonly modelingDir: string;
  private readonly optionalSkillPacksDir: string;
  private readonly optionalSkillPackRecords: OptionalSkillPackRecord[];

  constructor(packagesRoot = defaultPackagesRoot()) {
    this.benchmarksDir = join(packagesRoot, "benchmarks", "packs");
    this.distributionsDir = join(packagesRoot, "distributions", "channels");
    this.modelingDir = join(packagesRoot, "modeling", "profiles");
    this.optionalSkillPacksDir = join(packagesRoot, "skill-packs-optional");
    this.optionalSkillPackRecords = collectSkillPackRecords(
      this.optionalSkillPacksDir,
    );
  }

  benchmarkPacks(): BenchmarkPackRecord[] {
    return readJsonFiles<BenchmarkPackRecord>(this.benchmarksDir);
  }

  distributionChannels(): DistributionChannelRecord[] {
    return readJsonFiles<DistributionChannelRecord>(this.distributionsDir);
  }

  modelingProfiles(): ModelingProfileRecord[] {
    return readJsonFiles<ModelingProfileRecord>(this.modelingDir);
  }

  optionalSkillPacks(): OptionalSkillPackRecord[] {
    return this.optionalSkillPackRecords;
  }

  summary(): EcosystemSummary {
    return {
      benchmarkPacks: this.benchmarkPacks().length,
      distributionChannels: this.distributionChannels().length,
      modelingProfiles: this.modelingProfiles().length,
      optionalSkillPacks: this.optionalSkillPacks().length,
      packageRoots: [
        {
          label: "benchmarks",
          path: dirname(this.benchmarksDir),
          exists: existsSync(dirname(this.benchmarksDir)),
        },
        {
          label: "distributions",
          path: dirname(this.distributionsDir),
          exists: existsSync(dirname(this.distributionsDir)),
        },
        {
          label: "modeling",
          path: dirname(this.modelingDir),
          exists: existsSync(dirname(this.modelingDir)),
        },
        {
          label: "skill-packs-optional",
          path: this.optionalSkillPacksDir,
          exists: existsSync(this.optionalSkillPacksDir),
        },
      ],
    };
  }
}
