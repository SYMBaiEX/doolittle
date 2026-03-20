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
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  notes?: string;
  rubric?: string[];
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
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  notes?: string;
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

export interface TrajectoryCompressionBundle {
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  compressedPath: string;
  reportPath: string;
  sampleCount: number;
  sessionBlocks: Array<{
    sessionId: string;
    turns: number;
    preview: string[];
  }>;
  findings: string[];
}

export interface TrajectoryAnalysisBundle {
  focus: "dataset" | "research" | "evaluation" | "rl";
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  prompt: string;
  highlights: string[];
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
}

export interface TrajectoryEvaluationBundle {
  focus: "dataset" | "research" | "rl" | "evaluation";
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  prompt: string;
  highlights: string[];
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: string[];
  recommendations: string[];
  evaluationPath: string;
  reportPath: string;
  response?: string;
  responsePath?: string;
}

export interface TrajectoryResearchPackageBundle {
  focus: "dataset" | "research" | "rl" | "evaluation";
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  analysis: TrajectoryAnalysisBundle;
  evaluation: TrajectoryEvaluationBundle;
  packageManifestPath: string;
  reportPath: string;
  response?: string;
  responsePath?: string;
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
}

interface TrajectoryModelContext {
  provider: "openai" | "anthropic" | "offline";
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
}

export class TrajectoryService {
  constructor(
    private readonly baseDir: string,
    private readonly sessions: SessionService,
    private readonly getModelContext?: () => TrajectoryModelContext,
  ) {
    mkdirSync(baseDir, { recursive: true });
  }

  exportRecent(limit = 100): string {
    return this.exportDataset({ limit });
  }

  exportDataset(options: TrajectoryExportOptions = {}): string {
    const messages = this.collect(options);
    const label = this.slug(
      options.label ?? options.sessionId ?? options.role ?? "recent",
    );
    const path = join(this.baseDir, `trajectory-${Date.now()}-${label}.jsonl`);
    const jsonl = messages.map((message) => JSON.stringify(message)).join("\n");
    writeFileSync(path, jsonl, "utf8");
    return path;
  }

  exportBundle(limit = 100): {
    dataPath: string;
    manifestPath: string;
    summaryPath: string;
  } {
    return this.exportFilteredBundle({ limit });
  }

  exportFilteredBundle(options: TrajectoryExportOptions = {}): {
    dataPath: string;
    manifestPath: string;
    summaryPath: string;
  } {
    const messages = this.collect(options);
    const label = this.slug(
      options.label ?? options.sessionId ?? options.role ?? "recent",
    );
    const stamp = Date.now();
    const dataPath = join(this.baseDir, `trajectory-${stamp}-${label}.jsonl`);
    const manifestPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-manifest.json`,
    );
    const summaryPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-summary.md`,
    );

    writeFileSync(
      dataPath,
      messages.map((message) => JSON.stringify(message)).join("\n"),
      "utf8",
    );

    const roleCounts = messages.reduce<Record<string, number>>(
      (counts, message) => {
        counts[message.role] = (counts[message.role] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const sessions = Array.from(
      new Set(messages.map((message) => message.sessionId)),
    );

    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          label,
          purpose: options.purpose ?? "trajectory export",
          mode: options.mode ?? "dataset",
          tags: options.tags ?? [],
          notes: options.notes,
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
        `- Mode: ${options.mode ?? "dataset"}`,
        `- Purpose: ${options.purpose ?? "trajectory export"}`,
        ...(options.tags?.length ? [`- Tags: ${options.tags.join(", ")}`] : []),
        ...(options.notes ? [`- Notes: ${options.notes}`] : []),
        `- Messages: ${messages.length}`,
        `- Sessions: ${sessions.length}`,
        `- Filters: session=${options.sessionId ?? "any"}, role=${options.role ?? "any"}, limit=${options.limit ?? 100}`,
        "",
        "## Role Counts",
        ...Object.entries(roleCounts).map(
          ([role, count]) => `- ${role}: ${count}`,
        ),
        "",
        "## Sessions",
        ...(sessions.length
          ? sessions.map((sessionId) => `- ${sessionId}`)
          : ["- (none)"]),
      ].join("\n"),
      "utf8",
    );

    return { dataPath, manifestPath, summaryPath };
  }

  analyze(options: TrajectoryExportOptions = {}): TrajectoryAnalysisBundle {
    const bundle = this.exportFilteredBundle({
      ...options,
      limit: options.limit ?? 200,
      mode: options.mode ?? "research",
      purpose: options.purpose ?? "trajectory research",
    });
    const replay = this.replayBundle(bundle.manifestPath);
    const prompt = this.buildAnalysisPrompt(replay, options);
    const highlights = this.buildHighlights(replay);

    return {
      focus: "research",
      bundle: this.describeBundle(bundle.manifestPath),
      replay,
      prompt,
      highlights,
      purpose: options.purpose ?? "trajectory research",
      mode: options.mode ?? "research",
      tags: options.tags,
    };
  }

  async evaluate(
    options: TrajectoryExportOptions = {},
  ): Promise<TrajectoryEvaluationBundle> {
    const evaluationMode = this.normalizeEvaluationMode(options.mode);
    const analysis = this.analyze({
      ...options,
      mode: evaluationMode,
      purpose: options.purpose ?? "trajectory evaluation",
    });
    return this.evaluateBundle(analysis.bundle.manifestPath, {
      ...options,
      replay: analysis.replay,
      prompt: analysis.prompt,
      highlights: analysis.highlights,
      mode: evaluationMode,
      purpose: analysis.purpose,
      tags: analysis.tags,
    });
  }

  async evaluateBundle(
    manifestPath: string,
    options: {
      rubric?: string[];
      tags?: string[];
      replay?: TrajectoryReplayResult;
      prompt?: string;
      highlights?: string[];
      mode?: "dataset" | "research" | "evaluation" | "rl";
      purpose?: string;
    } = {},
  ): Promise<TrajectoryEvaluationBundle> {
    const bundle = this.describeBundle(manifestPath);
    const replay = options.replay ?? this.replayBundle(manifestPath);
    const evaluationMode = this.normalizeEvaluationMode(
      options.mode ?? bundle.mode,
    );
    const heuristics = this.scoreReplay(
      replay,
      options.rubric ?? options.tags ?? [],
    );
    const prompt =
      options.prompt ??
      this.buildAnalysisPrompt(replay, {
        mode: evaluationMode,
        purpose: options.purpose ?? bundle.purpose ?? "trajectory evaluation",
        tags: options.tags ?? bundle.tags ?? [],
        label: bundle.label,
      });
    const response = await this.requestModelText(
      prompt,
      this.getModelContext?.(),
      {
        focus: evaluationMode,
        replay,
        score: heuristics.score,
        findings: heuristics.findings,
        recommendations: heuristics.recommendations,
      },
    );
    const stamp = Date.now();
    const label = this.slug(`${bundle.label}-evaluation`);
    const evaluationPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}.evaluation.json`,
    );
    const reportPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-evaluation.md`,
    );
    const responsePath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-evaluation-response.md`,
    );

    writeFileSync(
      evaluationPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          bundle,
          replay,
          score: heuristics.score,
          grade: heuristics.grade,
          findings: heuristics.findings,
          recommendations: heuristics.recommendations,
          rubric: options.rubric ?? [],
          tags: options.tags ?? [],
          response,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      reportPath,
      [
        `# Trajectory Evaluation: ${bundle.label}`,
        "",
        `- Score: ${heuristics.score}/100`,
        `- Grade: ${heuristics.grade}`,
        `- Focus: ${evaluationMode}`,
        `- Purpose: ${options.purpose ?? bundle.purpose ?? "trajectory evaluation"}`,
        ...(options.tags?.length || bundle.tags?.length
          ? [`- Tags: ${(options.tags ?? bundle.tags ?? []).join(", ")}`]
          : []),
        ...(options.rubric?.length
          ? [`- Rubric: ${options.rubric.join(", ")}`]
          : []),
        "",
        "## Highlights",
        ...((options.highlights ?? []) || []).map((entry) => `- ${entry}`),
        "",
        "## Findings",
        ...(heuristics.findings.length
          ? heuristics.findings.map((entry) => `- ${entry}`)
          : ["- none"]),
        "",
        "## Recommendations",
        ...(heuristics.recommendations.length
          ? heuristics.recommendations.map((entry) => `- ${entry}`)
          : ["- none"]),
        "",
        "## Prompt",
        prompt,
        "",
        "## Response",
        response,
      ].join("\n"),
      "utf8",
    );

    writeFileSync(responsePath, response, "utf8");

    return {
      focus: evaluationMode,
      bundle,
      replay,
      prompt,
      highlights: options.highlights ?? this.buildHighlights(replay),
      purpose: options.purpose ?? bundle.purpose,
      mode: evaluationMode,
      tags: options.tags ?? bundle.tags,
      score: heuristics.score,
      grade: heuristics.grade,
      findings: heuristics.findings,
      recommendations: heuristics.recommendations,
      evaluationPath,
      reportPath,
      response,
      responsePath,
    };
  }

  async package(
    options: TrajectoryExportOptions = {},
  ): Promise<TrajectoryResearchPackageBundle> {
    const analysis = this.analyze({
      ...options,
      limit: options.limit ?? 200,
      mode: options.mode ?? "research",
      purpose: options.purpose ?? "trajectory research package",
    });
    const evaluation = await this.evaluateBundle(analysis.bundle.manifestPath, {
      ...options,
      replay: analysis.replay,
      prompt: analysis.prompt,
      highlights: analysis.highlights,
      mode: this.normalizeEvaluationMode(options.mode ?? analysis.mode),
      purpose:
        analysis.purpose ?? options.purpose ?? "trajectory research package",
      tags: options.tags ?? analysis.tags,
      rubric: options.rubric,
    });
    const stamp = Date.now();
    const label = this.slug(`${analysis.bundle.label}-package`);
    const packageManifestPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-package.json`,
    );
    const reportPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-package.md`,
    );
    const responsePath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-package-response.md`,
    );
    const response = evaluation.response ?? evaluation.reportPath;

    writeFileSync(
      packageManifestPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          bundle: analysis.bundle,
          replay: analysis.replay,
          analysis: {
            focus: analysis.focus,
            purpose: analysis.purpose,
            mode: analysis.mode,
            tags: analysis.tags,
            prompt: analysis.prompt,
            highlights: analysis.highlights,
          },
          evaluation: {
            focus: evaluation.focus,
            purpose: evaluation.purpose,
            mode: evaluation.mode,
            tags: evaluation.tags,
            score: evaluation.score,
            grade: evaluation.grade,
            findings: evaluation.findings,
            recommendations: evaluation.recommendations,
            evaluationPath: evaluation.evaluationPath,
            reportPath: evaluation.reportPath,
            responsePath: evaluation.responsePath,
          },
          response,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      reportPath,
      [
        `# Trajectory Research Package: ${analysis.bundle.label}`,
        "",
        `- Focus: ${analysis.focus}`,
        `- Purpose: ${analysis.purpose ?? options.purpose ?? "trajectory research package"}`,
        `- Mode: ${analysis.mode ?? options.mode ?? "research"}`,
        ...(analysis.tags?.length
          ? [`- Tags: ${analysis.tags.join(", ")}`]
          : []),
        "",
        "## Export Bundle",
        `- Manifest: ${analysis.bundle.manifestPath}`,
        `- Data: ${analysis.bundle.dataPath}`,
        `- Summary: ${analysis.bundle.summaryPath ?? "none"}`,
        "",
        "## Replay",
        `- Replay file: ${analysis.replay.replayPath}`,
        `- Replay summary: ${analysis.replay.replaySummaryPath}`,
        `- Replay count: ${analysis.replay.replayCount}`,
        "",
        "## Analysis",
        `- Prompt: ${analysis.prompt.slice(0, 280)}`,
        ...(analysis.highlights.length
          ? analysis.highlights.map((entry) => `- ${entry}`)
          : ["- none"]),
        "",
        "## Evaluation",
        `- Score: ${evaluation.score}/100`,
        `- Grade: ${evaluation.grade}`,
        `- Findings: ${evaluation.findings.join("; ") || "none"}`,
        `- Recommendations: ${evaluation.recommendations.join("; ") || "none"}`,
        `- Report: ${evaluation.reportPath}`,
      ].join("\n"),
      "utf8",
    );

    writeFileSync(responsePath, response, "utf8");

    return {
      focus: evaluation.focus,
      bundle: analysis.bundle,
      replay: analysis.replay,
      analysis,
      evaluation,
      packageManifestPath,
      reportPath,
      response,
      responsePath,
      purpose: analysis.purpose,
      mode: analysis.mode,
      tags: analysis.tags,
    };
  }

  packageLatest(): Promise<TrajectoryResearchPackageBundle | undefined> {
    const latest = this.listBundles(1)[0];
    if (!latest) {
      return Promise.resolve(undefined);
    }
    return this.package({
      limit: latest.limit,
      sessionId: latest.filters?.sessionId ?? undefined,
      role: latest.filters?.role ?? undefined,
      label: latest.label,
      purpose: latest.purpose,
      mode: latest.mode,
      tags: latest.tags,
      notes: latest.notes,
    });
  }

  replayBundle(manifestPath: string): TrajectoryReplayResult {
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as TrajectoryBundleEntry;
    const records = this.readRecords(manifest.dataPath);
    const stamp = Date.now();
    const label = this.slug(`${manifest.label}-replay`);
    const replayPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}.replay.json`,
    );
    const replaySummaryPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-replay.md`,
    );
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

  compressBundle(
    manifestPath: string,
    options: {
      sampleCount?: number;
    } = {},
  ): TrajectoryCompressionBundle {
    const bundle = this.describeBundle(manifestPath);
    const replay = this.replayBundle(manifestPath);
    const sampleCount = Math.max(1, options.sampleCount ?? 12);
    const records = this.readRecords(bundle.dataPath);
    const grouped = new Map<string, TrajectoryRecord[]>();
    for (const record of records) {
      const list = grouped.get(record.sessionId) ?? [];
      list.push(record);
      grouped.set(record.sessionId, list);
    }
    const sessionBlocks = Array.from(grouped.entries())
      .map(([sessionId, turns]) => ({
        sessionId,
        turns: turns.length,
        preview: turns
          .slice(0, sampleCount)
          .map((turn) => `[${turn.role}] ${turn.text.slice(0, 180)}`),
      }))
      .sort((a, b) => b.turns - a.turns);

    const findings = [
      `Compressed ${records.length} messages across ${grouped.size} sessions.`,
      bundle.tags?.length
        ? `Bundle tags: ${bundle.tags.join(", ")}.`
        : "Bundle tags: none.",
      `Largest session: ${sessionBlocks[0]?.sessionId ?? "n/a"} (${sessionBlocks[0]?.turns ?? 0} turns).`,
    ];

    const stamp = Date.now();
    const label = this.slug(`${bundle.label}-compressed`);
    const compressedPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}.compressed.json`,
    );
    const reportPath = join(
      this.baseDir,
      `trajectory-${stamp}-${label}-compressed.md`,
    );

    writeFileSync(
      compressedPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          bundle,
          replay,
          sampleCount,
          sessionBlocks,
          findings,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      reportPath,
      [
        `# Trajectory Compression: ${bundle.label}`,
        "",
        `- Source manifest: ${bundle.manifestPath}`,
        `- Messages: ${bundle.messageCount}`,
        `- Sessions: ${bundle.sessionCount}`,
        `- Sample count per session: ${sampleCount}`,
        "",
        "## Findings",
        ...findings.map((entry) => `- ${entry}`),
        "",
        "## Session Blocks",
        ...sessionBlocks.flatMap((block) => [
          `### ${block.sessionId} (${block.turns} turns)`,
          ...(block.preview.length
            ? block.preview.map((line) => `- ${line}`)
            : ["- (none)"]),
          "",
        ]),
      ].join("\n"),
      "utf8",
    );

    return {
      bundle,
      replay,
      compressedPath,
      reportPath,
      sampleCount,
      sessionBlocks,
      findings,
    };
  }

  compressLatest(): TrajectoryCompressionBundle | undefined {
    const latest = this.listBundles(1)[0];
    if (!latest) {
      return undefined;
    }
    return this.compressBundle(latest.manifestPath);
  }

  evaluateLatest(): Promise<TrajectoryEvaluationBundle | undefined> {
    const latest = this.listBundles(1)[0];
    if (!latest) {
      return Promise.resolve(undefined);
    }
    return this.evaluateBundle(latest.manifestPath, {
      mode: this.normalizeEvaluationMode(latest.mode),
      purpose: latest.purpose ?? "trajectory evaluation",
      tags: latest.tags ?? [],
    });
  }

  listBundles(limit = 20): TrajectoryBundleEntry[] {
    return readdirSync(this.baseDir)
      .filter((file) => file.endsWith("-manifest.json"))
      .map((file) => join(this.baseDir, file))
      .map(
        (manifestPath) =>
          JSON.parse(
            readFileSync(manifestPath, "utf8"),
          ) as TrajectoryBundleEntry,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  describeBundle(manifestPath: string): TrajectoryBundleEntry {
    return JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as TrajectoryBundleEntry;
  }

  private collect(options: TrajectoryExportOptions): TrajectoryRecord[] {
    const messages = this.sessions.recent(
      options.limit ?? 100,
    ) as TrajectoryRecord[];
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
      `Role counts: ${
        Object.entries(bundle.roleCounts)
          .map(([role, count]) => `${role}=${count}`)
          .join(", ") || "none"
      }`,
      ...(bundle.sessions.length
        ? [`Sessions: ${bundle.sessions.join(", ")}`]
        : ["Sessions: none"]),
    ];
  }

  private buildAnalysisPrompt(
    bundle: TrajectoryReplayResult,
    options: TrajectoryExportOptions = {},
  ): string {
    const preview = bundle.replayPreview
      .map(
        (message) => `[${message.role}] ${message.sessionId}: ${message.text}`,
      )
      .join("\n");

    return [
      "You are reviewing a trajectory bundle for Eliza Agent and should provide concise, actionable research analysis.",
      "Identify recurring intents, reusable skills, failure modes, and data/replay patterns that could be turned into training or skill synthesis inputs.",
      "Keep the response short and structured: summary, patterns, recommendations.",
      "",
      `Label: ${bundle.label}`,
      `Created: ${bundle.createdAt}`,
      `Mode: ${bundle.mode ?? options.mode ?? "research"}`,
      `Purpose: ${bundle.purpose ?? options.purpose ?? "trajectory research"}`,
      ...(bundle.tags?.length ? [`Tags: ${bundle.tags.join(", ")}`] : []),
      ...(bundle.notes ? [`Notes: ${bundle.notes}`] : []),
      `Messages: ${bundle.messageCount}`,
      `Sessions: ${bundle.sessionCount}`,
      `Filters: session=${bundle.filters?.sessionId ?? "any"}, role=${bundle.filters?.role ?? "any"}`,
      "",
      "Role counts:",
      ...Object.entries(bundle.roleCounts).map(
        ([role, count]) => `- ${role}: ${count}`,
      ),
      "",
      "Sessions:",
      ...(bundle.sessions.length
        ? bundle.sessions.map((sessionId) => `- ${sessionId}`)
        : ["- none"]),
      "",
      "Replay preview:",
      preview.slice(0, 2400) || "(empty)",
    ].join("\n");
  }

  private normalizeEvaluationMode(
    mode?: TrajectoryExportOptions["mode"],
  ): "research" | "rl" | "evaluation" {
    if (mode === "research" || mode === "rl") {
      return mode;
    }
    return "evaluation";
  }

  private async requestModelText(
    prompt: string,
    context: TrajectoryModelContext | undefined,
    metadata: {
      focus: string;
      replay?: TrajectoryReplayResult;
      score?: number;
      findings?: string[];
      recommendations?: string[];
    },
  ): Promise<string> {
    const canUseOpenAi = Boolean(context?.openAiApiKey);
    const canUseAnthropic = Boolean(context?.anthropicApiKey);

    if (
      !context ||
      context.provider === "offline" ||
      (!canUseOpenAi && !canUseAnthropic)
    ) {
      return [
        `Offline trajectory analysis for ${metadata.focus}.`,
        metadata.replay
          ? `Messages: ${metadata.replay.messageCount}`
          : undefined,
        typeof metadata.score === "number"
          ? `Score: ${metadata.score}`
          : undefined,
        metadata.findings?.length
          ? `Findings: ${metadata.findings.join("; ")}`
          : undefined,
        metadata.recommendations?.length
          ? `Recommendations: ${metadata.recommendations.join("; ")}`
          : undefined,
        "",
        prompt.slice(0, 1600),
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (
      (context.provider === "anthropic" && canUseAnthropic) ||
      (!canUseOpenAi && canUseAnthropic)
    ) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      };
      if (context.anthropicApiKey) {
        headers["x-api-key"] = context.anthropicApiKey;
      }
      const response = await fetch(
        `${context.anthropicBaseUrl ?? context.baseUrl}/messages`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: context.model,
            max_tokens: context.maxTokens,
            temperature: context.temperature,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Anthropic request failed (${response.status}): ${body}`,
        );
      }

      const data = (await response.json()) as {
        content?: Array<{ text?: string }>;
      };
      return (
        data.content
          ?.map((entry) => entry.text ?? "")
          .join("")
          .trim() || "No response returned."
      );
    }

    if (!canUseOpenAi) {
      return prompt.slice(0, 1600);
    }

    const response = await fetch(`${context.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: context.model,
        temperature: context.temperature,
        max_tokens: context.maxTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI-compatible request failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return (
      data.choices?.[0]?.message?.content?.trim() ?? "No response returned."
    );
  }

  private scoreReplay(
    replay: TrajectoryReplayResult,
    rubric: string[],
  ): {
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    findings: string[];
    recommendations: string[];
  } {
    const findings: string[] = [];
    const recommendations: string[] = [];
    let score = Math.min(50, replay.messageCount * 4);

    if (replay.sessionCount > 1) {
      score += 15;
      findings.push("Multiple sessions are represented in the bundle.");
    } else {
      findings.push("The bundle is concentrated in a single session.");
      recommendations.push(
        "Collect more session diversity for broader training coverage.",
      );
    }

    const roleKinds = Object.keys(replay.roleCounts).length;
    if (roleKinds >= 2) {
      score += 15;
      findings.push("Both user and assistant roles are present in the replay.");
    } else {
      recommendations.push(
        "Include both sides of the conversation for better supervision signal.",
      );
    }

    const averageLength = replay.replayPreview.length
      ? replay.replayPreview.reduce(
          (sum, message) => sum + message.text.length,
          0,
        ) / replay.replayPreview.length
      : 0;
    if (averageLength > 30) {
      score += 10;
    } else {
      recommendations.push(
        "Use fuller message content so the dataset carries clearer task intent.",
      );
    }

    const lowerText = replay.replayPreview
      .map((message) => message.text.toLowerCase())
      .join(" ");
    const rubricHits = rubric.filter(
      (token) => token && lowerText.includes(token.toLowerCase()),
    );
    if (rubricHits.length) {
      score += Math.min(20, rubricHits.length * 5);
      findings.push(`Rubric coverage observed for: ${rubricHits.join(", ")}.`);
    } else if (rubric.length) {
      recommendations.push(
        `Capture scenarios that mention: ${rubric.join(", ")}.`,
      );
    }

    score = Math.max(0, Math.min(100, score));
    const grade: "A" | "B" | "C" | "D" | "F" =
      score >= 90
        ? "A"
        : score >= 80
          ? "B"
          : score >= 70
            ? "C"
            : score >= 60
              ? "D"
              : "F";

    if (!findings.length) {
      findings.push("The replay bundle is structured and readable.");
    }

    return {
      score,
      grade,
      findings,
      recommendations: recommendations.length
        ? recommendations
        : ["No major issues were detected in this replay bundle."],
    };
  }
}
