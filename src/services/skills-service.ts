import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SkillDocument } from "@/types";

export class SkillsService {
  constructor(private readonly skillsDir: string) {}

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

    return heading ? heading.replace(/^#+\s*/u, "") : fallbackPath.split("/").at(-2) ?? "Untitled Skill";
  }

  private extractDescription(content: string): string {
    const bodyLine = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => Boolean(line) && !line.startsWith("#"));

    return bodyLine ?? "No description available.";
  }
}
