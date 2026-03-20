import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

interface BrowserConfig {
  provider: "lightpanda" | "basic";
  command: string;
  cdpUrl?: string;
  obeyRobots: boolean;
}

interface BrowserStatus {
  provider: "lightpanda" | "basic";
  ready: boolean;
  mode: "browser" | "fallback";
  detail: string;
  command?: string;
  cdpUrl?: string;
  lastFetchedAt?: string;
  lastSnapshotAt?: string;
  lastScreenshotAt?: string;
  lastComparisonAt?: string;
  lastError?: string;
  artifacts: {
    snapshot: boolean;
    screenshot: boolean;
    comparison: boolean;
  };
}

interface WebPageSnapshot {
  url: string;
  title?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  text: string;
  provider: "lightpanda" | "basic";
  mode: "browser" | "fallback";
  renderedAt: string;
  contentType: string;
  contentLength: number;
  wordCount: number;
  lineCount: number;
  linkCount: number;
  imageCount: number;
  headingCount: number;
  contentHash: string;
}

interface BrowserInspection {
  page: WebPageSnapshot;
  snapshotPath: string;
  screenshotPath: string;
  screenshotSvgPath: string;
  status: BrowserStatus;
}

interface BrowserCaptureBundle {
  page: WebPageSnapshot;
  snapshotPath: string;
  screenshotPath: string;
  screenshotSvgPath: string;
  manifestPath: string;
  reportPath: string;
  status: BrowserStatus;
}

interface BrowserComparisonBundle {
  left: BrowserCaptureBundle;
  right: BrowserCaptureBundle;
  manifestPath: string;
  reportPath: string;
  summary: {
    titleChanged: boolean;
    hashChanged: boolean;
    wordDelta: number;
    linkDelta: number;
    imageDelta: number;
    headingDelta: number;
  };
}

type BrowserAnalysisFocus = "browser" | "vision" | "research";

interface BrowserAnalysisBundle {
  focus: BrowserAnalysisFocus;
  capture: BrowserCaptureBundle;
  prompt: string;
  highlights: string[];
}

interface BrowserComparisonAnalysisBundle {
  focus: BrowserAnalysisFocus;
  comparison: BrowserComparisonBundle;
  prompt: string;
  highlights: string[];
}

async function runCommand(
  cmd: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timer));

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function commandExists(binary: string): Promise<boolean> {
  const result = await runCommand(
    ["/bin/zsh", "-lc", `command -v '${binary.replaceAll("'", "'\\''")}'`],
    5_000,
  ).catch(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "",
  }));
  return result.exitCode === 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extractReadableText(content: string, contentType = "text/html"): {
  title?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  text: string;
} {
  if (!/html|xhtml|xml|svg/i.test(contentType) && !/<[a-z][\s\S]*>/iu.test(content)) {
    const text = content
      .replace(/\r\n/gu, "\n")
      .split(/\n/u)
      .map((line) => line.replace(/\s+/gu, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      text: text.slice(0, 20_000),
    };
  }

  const html = content;
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/isu);
  const descriptionMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["'](.*?)["'][^>]*>/isu,
  );
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["'](.*?)["'][^>]*>/isu,
  );
  const text = html
    .replace(/<\/(p|div|section|article|li|h[1-6]|br)>/giu, "\n")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .split(/\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    title: titleMatch?.[1]?.trim(),
    metaDescription: descriptionMatch?.[1]?.trim(),
    canonicalUrl: canonicalMatch?.[1]?.trim(),
    text: text.slice(0, 20_000),
  };
}

function buildPageMetrics(
  html: string,
  text: string,
  contentType: string,
): Omit<WebPageSnapshot, "url" | "title" | "metaDescription" | "canonicalUrl" | "text" | "provider" | "mode" | "renderedAt"> {
  const wordCount = text ? text.split(/\s+/u).filter(Boolean).length : 0;
  const lineCount = text ? text.split(/\n/u).filter((line) => line.trim().length > 0).length : 0;
  const linkCount = (html.match(/<a\b/giu) ?? []).length;
  const imageCount = (html.match(/<img\b/giu) ?? []).length;
  const headingCount = (html.match(/<h[1-6]\b/giu) ?? []).length;
  const contentLength = Buffer.byteLength(html, "utf8");
  const contentHash = createHash("sha256").update(html).digest("hex").slice(0, 16);

  return {
    contentType,
    contentLength,
    wordCount,
    lineCount,
    linkCount,
    imageCount,
    headingCount,
    contentHash,
  };
}

function createScreenshotSvg(page: WebPageSnapshot, notes: string[]): string {
  const title = page.title ?? page.url;
  const excerpt = (page.text || page.metaDescription || "").replace(/\s+/gu, " ").slice(0, 240);
  const lines = [
    `Page: ${title}`,
    `URL: ${page.url}`,
    `Provider: ${page.provider} / ${page.mode}`,
    `Content: ${page.contentType} | ${page.wordCount} words | ${page.linkCount} links | ${page.imageCount} images`,
    ...(page.metaDescription ? [`Description: ${page.metaDescription}`] : []),
    ...(excerpt ? [`Excerpt: ${excerpt}`] : []),
    ...(notes.length ? [`Notes: ${notes[0]}`] : []),
  ];

  const rows = lines
    .map(
      (line, index) =>
        `<text x="24" y="${60 + index * 30}" fill="#f5f7fb" font-family="ui-monospace, SFMono-Regular, monospace" font-size="18">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.max(260, 120 + lines.length * 30)}" viewBox="0 0 1200 ${Math.max(260, 120 + lines.length * 30)}">
  <rect width="1200" height="${Math.max(260, 120 + lines.length * 30)}" fill="#0f172a"/>
  <rect x="20" y="20" width="1160" height="${Math.max(220, 80 + lines.length * 30)}" rx="18" fill="#111827" stroke="#334155" stroke-width="2"/>
  <text x="24" y="42" fill="#93c5fd" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="700">Eliza Agent Browser Capture</text>
  ${rows}
</svg>`;
}

function writeArtifact(
  outputDir: string,
  prefix: "snapshot" | "screenshot",
  page: WebPageSnapshot,
  notes: string[],
): { markdownPath: string; jsonPath: string; svgPath?: string } {
  const filePath = join(outputDir, `${prefix}-${Date.now()}.md`);
  const content = [
    `# ${prefix === "screenshot" ? "Browser Screenshot" : page.title ?? page.url}`,
    "",
    `Source: ${page.url}`,
    `Provider: ${page.provider}`,
    `Mode: ${page.mode}`,
    `Rendered at: ${page.renderedAt}`,
    `Content type: ${page.contentType}`,
    `Content length: ${page.contentLength}`,
    `Words: ${page.wordCount}`,
    `Lines: ${page.lineCount}`,
    `Links: ${page.linkCount}`,
    `Images: ${page.imageCount}`,
    `Headings: ${page.headingCount}`,
    `Hash: ${page.contentHash}`,
  ];

  if (page.metaDescription) {
    content.push(`Description: ${page.metaDescription}`);
  }

  if (page.canonicalUrl) {
    content.push(`Canonical: ${page.canonicalUrl}`);
  }

  content.push("", ...notes, "", page.text);

  writeFileSync(filePath, content.join("\n"), "utf8");

  const metadataPath = filePath.replace(/\.md$/u, ".json");
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        ...page,
        notes,
      },
      null,
      2,
    ),
    "utf8",
  );

  const svgPath =
    prefix === "screenshot"
      ? filePath.replace(/\.md$/u, ".svg")
      : undefined;
  if (svgPath) {
    writeFileSync(svgPath, createScreenshotSvg(page, notes), "utf8");
  }
  return { markdownPath: filePath, jsonPath: metadataPath, svgPath };
}

function slugifyUrl(url: string): string {
  return url
    .replace(/^https?:\/\//u, "")
    .replace(/^data:/u, "data-")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72)
    .toLowerCase() || "capture";
}

function compareSnapshotMetrics(left: WebPageSnapshot, right: WebPageSnapshot) {
  return {
    titleChanged: left.title !== right.title,
    hashChanged: left.contentHash !== right.contentHash,
    wordDelta: right.wordCount - left.wordCount,
    linkDelta: right.linkCount - left.linkCount,
    imageDelta: right.imageCount - left.imageCount,
    headingDelta: right.headingCount - left.headingCount,
  };
}

export class WebService {
  private lastFetchedAt?: string;
  private lastSnapshotAt?: string;
  private lastScreenshotAt?: string;
  private lastComparisonAt?: string;
  private lastError?: string;

  constructor(
    private readonly getConfig: () => BrowserConfig,
    private readonly outputDir = ".eliza-agent/web",
  ) {
    mkdirSync(this.outputDir, { recursive: true });
  }

  async status(): Promise<BrowserStatus> {
    const config = this.getConfig();
    if (config.provider === "basic") {
      return {
        provider: "basic",
        ready: true,
        mode: "fallback",
        detail: "Basic HTTP fetch mode is active.",
        lastFetchedAt: this.lastFetchedAt,
        lastSnapshotAt: this.lastSnapshotAt,
        lastScreenshotAt: this.lastScreenshotAt,
        lastComparisonAt: this.lastComparisonAt,
        lastError: this.lastError,
        artifacts: {
          snapshot: true,
          screenshot: true,
          comparison: true,
        },
      };
    }

    const available = await commandExists(config.command);
    return {
      provider: "lightpanda",
      ready: available,
      mode: available ? "browser" : "fallback",
      detail: available
        ? "Lightpanda is available for browser-backed fetch, snapshot, and screenshot artifacts."
        : "Lightpanda is configured as the default browser provider, but the command is not available locally. Falling back to basic HTTP fetch mode.",
      command: config.command,
      cdpUrl: config.cdpUrl,
      lastFetchedAt: this.lastFetchedAt,
      lastSnapshotAt: this.lastSnapshotAt,
      lastScreenshotAt: this.lastScreenshotAt,
      lastComparisonAt: this.lastComparisonAt,
      lastError: this.lastError,
      artifacts: {
        snapshot: true,
        screenshot: true,
        comparison: true,
      },
    };
  }

  async fetchText(url: string): Promise<WebPageSnapshot> {
    const config = this.getConfig();
    if (config.provider === "lightpanda" && (await commandExists(config.command))) {
      try {
        const fetched = await this.fetchWithLightpanda(url, config);
        const readable = extractReadableText(fetched.body, fetched.contentType);
        const metrics = buildPageMetrics(fetched.body, readable.text, fetched.contentType);
        this.lastFetchedAt = nowIso();
        this.lastError = undefined;
        return {
          url,
          ...readable,
          ...metrics,
          provider: "lightpanda",
          mode: "browser",
          renderedAt: new Date().toISOString(),
        };
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        // Fall through to basic fetch when browser execution is unavailable.
      }
    }

    try {
      const fetched = await this.fetchWithBasic(url);
      const readable = extractReadableText(fetched.body, fetched.contentType);
      const metrics = buildPageMetrics(fetched.body, readable.text, fetched.contentType);
      this.lastFetchedAt = nowIso();
      this.lastError = undefined;
      return {
        url,
        ...readable,
        ...metrics,
        provider: config.provider,
        mode: "fallback",
        renderedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async snapshot(url: string): Promise<string> {
    const page = await this.fetchText(url);
    const artifact = writeArtifact(
      this.outputDir,
      "snapshot",
      page,
      [
        "This artifact captures readable text extracted from the page.",
        "It is suitable for search, diffing, and long-form analysis.",
      ],
    );
    this.lastSnapshotAt = nowIso();
    return artifact.markdownPath;
  }

  async screenshot(url: string): Promise<string> {
    const page = await this.fetchText(url);
    const artifact = writeArtifact(
      this.outputDir,
      "screenshot",
      page,
      [
        "This is a lightweight screenshot artifact placeholder.",
        "When a pixel-level browser capture is available, this file can be replaced with a real image artifact.",
        `Captured from ${page.provider} in ${page.mode} mode.`,
      ],
    );
    this.lastScreenshotAt = nowIso();
    return artifact.markdownPath;
  }

  async inspect(url: string): Promise<BrowserInspection> {
    const page = await this.fetchText(url);
    const snapshotArtifact = writeArtifact(
      this.outputDir,
      "snapshot",
      page,
      [
        "This artifact captures readable text extracted from the page.",
        "It is suitable for search, diffing, and long-form analysis.",
      ],
    );
    const screenshotArtifact = writeArtifact(
      this.outputDir,
      "screenshot",
      page,
      [
        "This is a lightweight screenshot artifact placeholder.",
        "When a pixel-level browser capture is available, this file can be replaced with a real image artifact.",
        `Captured from ${page.provider} in ${page.mode} mode.`,
      ],
    );
    this.lastSnapshotAt = nowIso();
    this.lastScreenshotAt = nowIso();
    return {
      page,
      snapshotPath: snapshotArtifact.markdownPath,
      screenshotPath: screenshotArtifact.markdownPath,
      screenshotSvgPath: screenshotArtifact.svgPath ?? screenshotArtifact.markdownPath.replace(/\.md$/u, ".svg"),
      status: await this.status(),
    };
  }

  async capture(url: string): Promise<BrowserCaptureBundle> {
    const inspection = await this.inspect(url);
    const stamp = Date.now();
    const slug = slugifyUrl(url);
    const manifestPath = join(this.outputDir, `capture-${stamp}-${slug}.json`);
    const reportPath = join(this.outputDir, `capture-${stamp}-${slug}.md`);

    const manifest = {
      url,
      createdAt: new Date().toISOString(),
      page: inspection.page,
      artifacts: {
        snapshotPath: inspection.snapshotPath,
        screenshotPath: inspection.screenshotPath,
        screenshotSvgPath: inspection.screenshotSvgPath,
      },
      status: inspection.status,
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    writeFileSync(
      reportPath,
      [
        `# Browser Capture Bundle`,
        "",
        `URL: ${inspection.page.url}`,
        `Title: ${inspection.page.title ?? "n/a"}`,
        `Provider: ${inspection.page.provider}`,
        `Mode: ${inspection.page.mode}`,
        `Rendered at: ${inspection.page.renderedAt}`,
        `Words: ${inspection.page.wordCount}`,
        `Lines: ${inspection.page.lineCount}`,
        `Links: ${inspection.page.linkCount}`,
        `Images: ${inspection.page.imageCount}`,
        `Headings: ${inspection.page.headingCount}`,
        `Hash: ${inspection.page.contentHash}`,
        "",
        "## Artifacts",
        `- Snapshot: ${inspection.snapshotPath}`,
        `- Screenshot: ${inspection.screenshotPath}`,
        `- Screenshot SVG: ${inspection.screenshotSvgPath}`,
        `- Manifest: ${manifestPath}`,
        "",
        "## Preview",
        (inspection.page.metaDescription ?? inspection.page.text.slice(0, 1200)) || "(empty)",
      ].join("\n"),
      "utf8",
    );

    return {
      ...inspection,
      manifestPath,
      reportPath,
    };
  }

  async analyze(
    url: string,
    focus: BrowserAnalysisFocus = "vision",
  ): Promise<BrowserAnalysisBundle> {
    const capture = await this.capture(url);
    return {
      focus,
      capture,
      prompt: this.buildAnalysisPrompt(capture, focus),
      highlights: this.buildHighlights(capture.page),
    };
  }

  async compare(leftUrl: string, rightUrl: string): Promise<BrowserComparisonBundle> {
    const left = await this.capture(leftUrl);
    const right = await this.capture(rightUrl);
    const stamp = Date.now();
    const slug = `${slugifyUrl(leftUrl)}-vs-${slugifyUrl(rightUrl)}`;
    const manifestPath = join(this.outputDir, `comparison-${stamp}-${slug}.json`);
    const reportPath = join(this.outputDir, `comparison-${stamp}-${slug}.md`);
    const summary = compareSnapshotMetrics(left.page, right.page);
    this.lastComparisonAt = nowIso();

    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          left: {
            url: left.page.url,
            manifestPath: left.manifestPath,
            reportPath: left.reportPath,
            snapshotPath: left.snapshotPath,
            screenshotPath: left.screenshotPath,
            screenshotSvgPath: left.screenshotSvgPath,
          },
          right: {
            url: right.page.url,
            manifestPath: right.manifestPath,
            reportPath: right.reportPath,
            snapshotPath: right.snapshotPath,
            screenshotPath: right.screenshotPath,
            screenshotSvgPath: right.screenshotSvgPath,
          },
          summary,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      reportPath,
      [
        `# Browser Comparison Bundle`,
        "",
        `Left: ${left.page.url}`,
        `Right: ${right.page.url}`,
        `Left title: ${left.page.title ?? "n/a"}`,
        `Right title: ${right.page.title ?? "n/a"}`,
        `Left hash: ${left.page.contentHash}`,
        `Right hash: ${right.page.contentHash}`,
        `Title changed: ${summary.titleChanged}`,
        `Hash changed: ${summary.hashChanged}`,
        `Word delta: ${summary.wordDelta}`,
        `Link delta: ${summary.linkDelta}`,
        `Image delta: ${summary.imageDelta}`,
        `Heading delta: ${summary.headingDelta}`,
        "",
        "## Artifacts",
        `- Left snapshot: ${left.snapshotPath}`,
        `- Left screenshot: ${left.screenshotPath}`,
        `- Left manifest: ${left.manifestPath}`,
        `- Right snapshot: ${right.snapshotPath}`,
        `- Right screenshot: ${right.screenshotPath}`,
        `- Right manifest: ${right.manifestPath}`,
        `- Comparison manifest: ${manifestPath}`,
        "",
        "## Left Preview",
        (left.page.metaDescription ?? left.page.text.slice(0, 900)) || "(empty)",
        "",
        "## Right Preview",
        (right.page.metaDescription ?? right.page.text.slice(0, 900)) || "(empty)",
      ].join("\n"),
      "utf8",
    );

    return {
      left,
      right,
      manifestPath,
      reportPath,
      summary,
    };
  }

  async analyzeComparison(
    leftUrl: string,
    rightUrl: string,
    focus: BrowserAnalysisFocus = "research",
  ): Promise<BrowserComparisonAnalysisBundle> {
    const comparison = await this.compare(leftUrl, rightUrl);
    return {
      focus,
      comparison,
      prompt: this.buildComparisonPrompt(comparison, focus),
      highlights: this.buildComparisonHighlights(comparison),
    };
  }

  private async fetchWithBasic(url: string): Promise<{ body: string; contentType: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Web fetch failed (${response.status}): ${await response.text()}`);
    }
    return {
      body: await response.text(),
      contentType: response.headers.get("content-type") ?? "text/plain",
    };
  }

  private async fetchWithLightpanda(
    url: string,
    config: BrowserConfig,
  ): Promise<{ body: string; contentType: string }> {
    const args = [
      config.command,
      "fetch",
      ...(config.obeyRobots ? ["--obey_robots"] : []),
      url,
    ];

    const result = await runCommand(args, 20_000);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Lightpanda fetch failed with exit code ${result.exitCode}.`);
    }

    return {
      body: result.stdout,
      contentType: "text/html; charset=utf-8",
    };
  }

  private buildHighlights(page: WebPageSnapshot): string[] {
    return [
      page.title ? `Title: ${page.title}` : undefined,
      page.metaDescription ? `Description: ${page.metaDescription}` : undefined,
      page.canonicalUrl ? `Canonical: ${page.canonicalUrl}` : undefined,
      `Provider: ${page.provider}/${page.mode}`,
      `Content: ${page.contentType}`,
      `Words: ${page.wordCount}`,
      `Links: ${page.linkCount}`,
      `Images: ${page.imageCount}`,
      `Headings: ${page.headingCount}`,
    ].filter(Boolean) as string[];
  }

  private buildAnalysisPrompt(capture: BrowserCaptureBundle, focus: BrowserAnalysisFocus): string {
    const page = capture.page;
    const intent =
      focus === "vision" ? "vision-style analysis" : focus === "research" ? "research analysis" : "browser analysis";

    return [
      `You are reviewing a browser capture for Eliza Agent and should provide concise, actionable ${intent}.`,
      `Focus on layout, hierarchy, important content, likely user intent, and any risks or missing details.`,
      `Keep the response short and structured: summary, signals, recommendations.`,
      "",
      `URL: ${page.url}`,
      `Title: ${page.title ?? "n/a"}`,
      `Description: ${page.metaDescription ?? "n/a"}`,
      `Canonical: ${page.canonicalUrl ?? "n/a"}`,
      `Provider: ${page.provider}`,
      `Mode: ${page.mode}`,
      `Content type: ${page.contentType}`,
      `Words: ${page.wordCount}`,
      `Links: ${page.linkCount}`,
      `Images: ${page.imageCount}`,
      `Headings: ${page.headingCount}`,
      `Content hash: ${page.contentHash}`,
      "",
      "Artifacts:",
      `- Snapshot: ${capture.snapshotPath}`,
      `- Screenshot: ${capture.screenshotPath}`,
      `- Screenshot SVG: ${capture.screenshotSvgPath}`,
      `- Manifest: ${capture.manifestPath}`,
      `- Report: ${capture.reportPath}`,
      "",
      "Readable text preview:",
      page.text.slice(0, 2400) || "(empty)",
    ].join("\n");
  }

  private buildComparisonHighlights(comparison: BrowserComparisonBundle): string[] {
    return [
      `Left title: ${comparison.left.page.title ?? "n/a"}`,
      `Right title: ${comparison.right.page.title ?? "n/a"}`,
      `Title changed: ${comparison.summary.titleChanged}`,
      `Hash changed: ${comparison.summary.hashChanged}`,
      `Word delta: ${comparison.summary.wordDelta}`,
      `Link delta: ${comparison.summary.linkDelta}`,
      `Image delta: ${comparison.summary.imageDelta}`,
      `Heading delta: ${comparison.summary.headingDelta}`,
    ];
  }

  private buildComparisonPrompt(
    comparison: BrowserComparisonBundle,
    focus: BrowserAnalysisFocus,
  ): string {
    const intent =
      focus === "vision" ? "vision-style comparison" : focus === "research" ? "research comparison" : "browser comparison";

    return [
      `You are comparing two browser captures for Eliza Agent and should provide concise, actionable ${intent}.`,
      `Highlight visual or semantic changes, likely user-facing impact, and any regression risks.`,
      `Keep the response short and structured: summary, change list, recommendations.`,
      "",
      `Left URL: ${comparison.left.page.url}`,
      `Right URL: ${comparison.right.page.url}`,
      `Left title: ${comparison.left.page.title ?? "n/a"}`,
      `Right title: ${comparison.right.page.title ?? "n/a"}`,
      `Left hash: ${comparison.left.page.contentHash}`,
      `Right hash: ${comparison.right.page.contentHash}`,
      `Title changed: ${comparison.summary.titleChanged}`,
      `Hash changed: ${comparison.summary.hashChanged}`,
      `Word delta: ${comparison.summary.wordDelta}`,
      `Link delta: ${comparison.summary.linkDelta}`,
      `Image delta: ${comparison.summary.imageDelta}`,
      `Heading delta: ${comparison.summary.headingDelta}`,
      "",
      "Artifacts:",
      `- Left snapshot: ${comparison.left.snapshotPath}`,
      `- Right snapshot: ${comparison.right.snapshotPath}`,
      `- Comparison report: ${comparison.reportPath}`,
      `- Comparison manifest: ${comparison.manifestPath}`,
      "",
      "Left preview:",
      (comparison.left.page.metaDescription ?? comparison.left.page.text.slice(0, 1200)) || "(empty)",
      "",
      "Right preview:",
      (comparison.right.page.metaDescription ?? comparison.right.page.text.slice(0, 1200)) || "(empty)",
    ].join("\n");
  }
}
