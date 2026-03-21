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

export interface EcosystemSummary {
  benchmarkPacks: number;
  distributionChannels: number;
  modelingProfiles: number;
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

export class EcosystemService {
  private readonly benchmarksDir: string;
  private readonly distributionsDir: string;
  private readonly modelingDir: string;

  constructor(packagesRoot = defaultPackagesRoot()) {
    this.benchmarksDir = join(packagesRoot, "benchmarks", "packs");
    this.distributionsDir = join(packagesRoot, "distributions", "channels");
    this.modelingDir = join(packagesRoot, "modeling", "profiles");
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

  summary(): EcosystemSummary {
    return {
      benchmarkPacks: this.benchmarkPacks().length,
      distributionChannels: this.distributionChannels().length,
      modelingProfiles: this.modelingProfiles().length,
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
      ],
    };
  }
}
