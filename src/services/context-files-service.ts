import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContextDocument } from "@/types";

const contextFileNames = ["AGENTS.md", "SOUL.md", "MISSION.md", "ROADMAP.md"];

export class ContextFilesService {
  constructor(private readonly workspaceDir: string) {}

  list(): ContextDocument[] {
    return contextFileNames
      .map((name) => {
        const path = join(this.workspaceDir, name);
        if (!existsSync(path)) {
          return undefined;
        }
        return {
          name,
          path,
          content: readFileSync(path, "utf8"),
        };
      })
      .filter((doc): doc is ContextDocument => Boolean(doc));
  }

  render(): string {
    const docs = this.list();
    if (!docs.length) {
      return "(no workspace context files found)";
    }

    return docs
      .map((doc) => `# ${doc.name}\n${doc.content.trim()}`)
      .join("\n\n");
  }
}
