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

interface TrajectoryReplayResult extends TrajectoryBundleEntry {
  replayPath: string;
  replaySummaryPath: string;
  replayCount: number;
  replayPreview: Array<{
    sessionId: string;
    createdAt: string;
    role: "user" | "assistant" | "system";
    text: string;
  }>;
}

export interface TrajectoryAnalysisBundle {
  focus: "research";
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  prompt: string;
  highlights: string[];
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

  analyze(options: TrajectoryExportOptions = {}): TrajectoryAnalysisBundle {
    const bundle = this.exportFilteredBundle({
      ...options,
      limit: options.limit ?? 200,
    });
    const replay = this.replayBundle(bundle.manifestPath);
    const prompt = this.buildAnalysisPrompt(replay);
    const highlights = this.buildHighlights(replay);

    return {
      focus: "research",
      bundle: this.describeBundle(bundle.manifestPath),
      replay,
      prompt,
      highlights,
    };
  }

  replayBundle(manifestPath: string): TrajectoryReplayResult {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as TrajectoryBundleEntry;
    const records = this.readRecords(manifest.dataPath);
    const stamp = Date.now();
    const label = this.slug(`${manifest.label}-replay`);
    const replayPath = join(this.baseDir, `trajectory-${stamp}-${label}.replay.json`);
    const replaySummaryPath = join(this.baseDir, `trajectory-${stamp}-${label}-replay.md`);
    const replayPreview = records.slice(0, 20);

    writeFileSync(
      replayPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          sourceManifestPath: manifest.manifestPath,
          sourceDataPath: manifest.dataPath,
          replayCount: records.length,
          sessions: manifest.sessions,
          roleCounts: manifest.roleCounts,
          replayPreview,
          messages: records,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      replaySummaryPath,
      [
        `# Trajectory Replay: ${manifest.label}`,
        "",
        `- Source manifest: ${manifest.manifestPath}`,
        `- Source data: ${manifest.dataPath}`,
        `- Replay file: ${replayPath}`,
        `- Messages: ${records.length}`,
        `- Sessions: ${manifest.sessions.length}`,
        "",
        "## Replay Preview",
        ...(replayPreview.length
          ? replayPreview.map(
              (message) =>
                `- [${message.role}] ${message.sessionId} @ ${message.createdAt}: ${message.text}`,
            )
          : ["- (none)"]),
      ].join("\n"),
      "utf8",
    );

    return {
      ...manifest,
      replayPath,
      replaySummaryPath,
      replayCount: records.length,
      replayPreview,
    };
  }

  replayLatest(): TrajectoryReplayResult | undefined {
    const latest = this.listBundles(1)[0];
    if (!latest) {
      return undefined;
    }
    return this.replayBundle(latest.manifestPath);
  }

  listBundles(limit = 20): TrajectoryBundleEntry[] {
    return readdirSync(this.baseDir)
      .filter((file) => file.endsWith("-manifest.json"))
      .map((file) => join(this.baseDir, file))
      .map((manifestPath) => JSON.parse(readFileSync(manifestPath, "utf8")) as TrajectoryBundleEntry)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  describeBundle(manifestPath: string): TrajectoryBundleEntry {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as TrajectoryBundleEntry;
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

  private readRecords(dataPath: string): TrajectoryRecord[] {
    const raw = readFileSync(dataPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return raw.map((line) => JSON.parse(line) as TrajectoryRecord);
  }

  private buildHighlights(bundle: TrajectoryReplayResult): string[] {
    return [
      `Messages: ${bundle.messageCount}`,
      `Sessions: ${bundle.sessionCount}`,
      `Role counts: ${Object.entries(bundle.roleCounts)
        .map(([role, count]) => `${role}=${count}`)
        .join(", ") || "none"}`,
      ...(bundle.sessions.length ? [`Sessions: ${bundle.sessions.join(", ")}`] : ["Sessions: none"]),
    ];
  }

  private buildAnalysisPrompt(bundle: TrajectoryReplayResult): string {
    const preview = bundle.replayPreview
      .map((message) => `[${message.role}] ${message.sessionId}: ${message.text}`)
      .join("\n");

    return [
      "You are reviewing a trajectory bundle for Eliza Agent and should provide concise, actionable research analysis.",
      "Identify recurring intents, reusable skills, failure modes, and data/replay patterns that could be turned into training or skill synthesis inputs.",
      "Keep the response short and structured: summary, patterns, recommendations.",
      "",
      `Label: ${bundle.label}`,
      `Created: ${bundle.createdAt}`,
      `Messages: ${bundle.messageCount}`,
      `Sessions: ${bundle.sessionCount}`,
      `Filters: session=${bundle.filters?.sessionId ?? "any"}, role=${bundle.filters?.role ?? "any"}`,
      "",
      "Role counts:",
      ...Object.entries(bundle.roleCounts).map(([role, count]) => `- ${role}: ${count}`),
      "",
      "Sessions:",
      ...(bundle.sessions.length ? bundle.sessions.map((sessionId) => `- ${sessionId}`) : ["- none"]),
      "",
      "Replay preview:",
      preview.slice(0, 2400) || "(empty)",
    ].join("\n");
  }
}
