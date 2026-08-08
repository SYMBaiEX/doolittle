import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface OptionalSkillPackRecord {
  slug: string;
  title: string;
  description: string;
  path: string;
  category: string;
}

export interface EcosystemSummary {
  optionalSkillPacks: number;
  packageRoots: Array<{
    label: string;
    path: string;
    exists: boolean;
  }>;
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
  private readonly optionalSkillPacksDir: string;
  private readonly optionalSkillPackRecords: OptionalSkillPackRecord[];

  constructor(packagesRoot = defaultPackagesRoot()) {
    this.optionalSkillPacksDir = join(packagesRoot, "skill-packs-optional");
    this.optionalSkillPackRecords = collectSkillPackRecords(
      this.optionalSkillPacksDir,
    );
  }

  optionalSkillPacks(): OptionalSkillPackRecord[] {
    return this.optionalSkillPackRecords;
  }

  summary(): EcosystemSummary {
    return {
      optionalSkillPacks: this.optionalSkillPacks().length,
      packageRoots: [
        {
          label: "skill-packs-optional",
          path: this.optionalSkillPacksDir,
          exists: existsSync(this.optionalSkillPacksDir),
        },
      ],
    };
  }
}
