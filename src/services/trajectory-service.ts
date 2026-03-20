import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionService } from "./session-service";

interface TrajectoryFilters {
  sessionId?: string;
  role?: "user" | "assistant" | "system";
}

interface TrajectoryExportOptions extends TrajectoryFilters {
  limit?: number;
  label?: string;
}

interface TrajectoryRecord {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

interface TrajectoryBundleEntry {
  manifestPath: string;
  dataPath: string;
  summaryPath?: string;
  createdAt: string;
  label: string;
  limit: number;
  filters?: {
    sessionId?: string | null;
    role?: "user" | "assistant" | "system" | null;
  };
  messageCount: number;
  sessionCount: number;
  sessions: string[];
  roleCounts: Record<string, number>;
}

export class TrajectoryService {
  constructor(
    private readonly baseDir: string,
    private readonly sessions: SessionService,
  ) {
    mkdirSync(baseDir, { recursive: true });
  }

  exportRecent(limit = 100): string {
    return this.exportDataset({ limit });
  }

  exportDataset(options: TrajectoryExportOptions = {}): string {
    const messages = this.collect(options);
    const label = this.slug(options.label ?? options.sessionId ?? options.role ?? "recent");
    const path = join(this.baseDir, `trajectory-${Date.now()}-${label}.jsonl`);
    const jsonl = messages.map((message) => JSON.stringify(message)).join("\n");
    writeFileSync(path, jsonl, "utf8");
    return path;
  }

  exportBundle(limit = 100): { dataPath: string; manifestPath: string; summaryPath: string } {
    return this.exportFilteredBundle({ limit });
  }

  exportFilteredBundle(
    options: TrajectoryExportOptions = {},
  ): { dataPath: string; manifestPath: string; summaryPath: string } {
    const messages = this.collect(options);
    const label = this.slug(options.label ?? options.sessionId ?? options.role ?? "recent");
    const stamp = Date.now();
    const dataPath = join(this.baseDir, `trajectory-${stamp}-${label}.jsonl`);
    const manifestPath = join(this.baseDir, `trajectory-${stamp}-${label}-manifest.json`);
    const summaryPath = join(this.baseDir, `trajectory-${stamp}-${label}-summary.md`);

    writeFileSync(dataPath, messages.map((message) => JSON.stringify(message)).join("\n"), "utf8");

    const roleCounts = messages.reduce<Record<string, number>>((counts, message) => {
      counts[message.role] = (counts[message.role] ?? 0) + 1;
      return counts;
    }, {});
    const sessions = Array.from(new Set(messages.map((message) => message.sessionId)));

    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          label,
          limit: options.limit ?? 100,
          manifestPath,
          filters: {
            sessionId: options.sessionId ?? null,
            role: options.role ?? null,
          },
          dataPath,
          summaryPath,
          messageCount: messages.length,
          sessionCount: sessions.length,
          sessions,
          roleCounts,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      summaryPath,
      [
        `# Trajectory Bundle: ${label}`,
        "",
        `- Created: ${new Date().toISOString()}`,
        `- Messages: ${messages.length}`,
        `- Sessions: ${sessions.length}`,
        `- Filters: session=${options.sessionId ?? "any"}, role=${options.role ?? "any"}, limit=${options.limit ?? 100}`,
        "",
        "## Role Counts",
        ...Object.entries(roleCounts).map(([role, count]) => `- ${role}: ${count}`),
        "",
        "## Sessions",
        ...(sessions.length ? sessions.map((sessionId) => `- ${sessionId}`) : ["- (none)"]),
      ].join("\n"),
      "utf8",
    );

    return { dataPath, manifestPath, summaryPath };
  }

  listBundles(limit = 20): TrajectoryBundleEntry[] {
    return readdirSync(this.baseDir)
      .filter((file) => file.endsWith("-manifest.json"))
      .map((file) => join(this.baseDir, file))
      .map((manifestPath) => JSON.parse(readFileSync(manifestPath, "utf8")) as TrajectoryBundleEntry)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  private collect(options: TrajectoryExportOptions): TrajectoryRecord[] {
    const messages = this.sessions.recent(options.limit ?? 100) as TrajectoryRecord[];
    return messages.filter((message) => {
      if (options.sessionId && message.sessionId !== options.sessionId) {
        return false;
      }
      if (options.role && message.role !== options.role) {
        return false;
      }
      return true;
    });
  }

  private slug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }
}
