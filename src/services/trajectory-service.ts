import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionService } from "./session-service";

export class TrajectoryService {
  constructor(
    private readonly baseDir: string,
    private readonly sessions: SessionService,
  ) {
    mkdirSync(baseDir, { recursive: true });
  }

  exportRecent(limit = 100): string {
    const messages = this.sessions.recent(limit);
    const path = join(this.baseDir, `trajectory-${Date.now()}.jsonl`);
    const jsonl = messages
      .map((message) =>
        JSON.stringify({
          sessionId: message.sessionId,
          createdAt: message.createdAt,
          role: message.role,
          text: message.text,
        }),
      )
      .join("\n");
    writeFileSync(path, jsonl, "utf8");
    return path;
  }

  exportBundle(limit = 100): { dataPath: string; manifestPath: string } {
    const dataPath = this.exportRecent(limit);
    const manifestPath = join(this.baseDir, `trajectory-${Date.now()}-manifest.json`);
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          limit,
          dataPath,
        },
        null,
        2,
      ),
      "utf8",
    );
    return { dataPath, manifestPath };
  }
}
