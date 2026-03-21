import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SkillDocument } from "@/types";
import type { AgentSdkService } from "./agent-sdk-service";

export interface SkillsWorkspaceSummary {
  total: number;
  curated: number;
  generated: number;
  categories: Array<{
    name: string;
    count: number;
  }>;
  roots: Array<{
    name: string;
    count: number;
  }>;
}

export class SkillsService {
  constructor(
    private readonly skillsDir: string,
    private readonly agentSdk: AgentSdkService,
  ) {}

  rootDir(): string {
    return this.skillsDir;
  }

  list(): SkillDocument[] {
    return this.walk(this.skillsDir)
      .filter((path) => path.endsWith("SKILL.md"))
      .map((path) => {
        const content = readFileSync(path, "utf8");
        const title = this.extractTitle(content, path);
        const description = this.extractDescription(content);
        const slug = relative(this.skillsDir, path)
          .replaceAll("\\", "/")
          .replace(/\/SKILL\.md$/u, "")
          .replace(/\.md$/u, "");

        return {
          slug,
          title,
          description,
          path,
          content,
        };
      })
      .sort((left, right) => left.slug.localeCompare(right.slug));
  }

  get(slug: string): SkillDocument | undefined {
    return this.list().find((skill) => skill.slug === slug);
  }

  summary(): SkillsWorkspaceSummary {
    const skills = this.list();
    const counts = new Map<string, number>();
    const roots = new Map<string, number>();
    let generated = 0;

    for (const skill of skills) {
      const slug = skill.slug.replaceAll("\\", "/");
      const root = slug.split("/")[0] ?? "unknown";
      const category = slug.startsWith("generated/")
        ? "generated"
        : slug.split("/").slice(0, 2).join("/") || root;
      roots.set(root, (roots.get(root) ?? 0) + 1);
      counts.set(category, (counts.get(category) ?? 0) + 1);
      if (root === "generated") {
        generated += 1;
      }
    }

    return {
      total: skills.length,
      curated: skills.length - generated,
      generated,
      categories: [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.name.localeCompare(right.name),
        ),
      roots: [...roots.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.name.localeCompare(right.name),
        ),
    };
  }

  async catalog(limit = 20) {
    return this.agentSdk.skillCatalog(false, limit);
  }

  async searchCatalog(query: string, limit = 15) {
    return this.agentSdk.searchSkillCatalog(query, limit);
  }

  private walk(root: string): string[] {
    const entries = readdirSync(root);
    const files: string[] = [];

    for (const entry of entries) {
      const path = join(root, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        files.push(...this.walk(path));
      } else {
        files.push(path);
      }
    }

    return files;
  }

  private extractTitle(content: string, fallbackPath: string): string {
    const heading = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("#"));

    return heading
      ? heading.replace(/^#+\s*/u, "")
      : (fallbackPath.split("/").at(-2) ?? "Untitled Skill");
  }

  private extractDescription(content: string): string {
    const bodyLine = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => Boolean(line) && !line.startsWith("#"));

    return bodyLine ?? "No description available.";
  }
}
