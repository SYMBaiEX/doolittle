import { asRecord, asString, displayTimestamp, titleCase } from "./lib";

export type BrowserAction =
  | "inspect"
  | "capture"
  | "screenshot"
  | "snapshot"
  | "analyze";

export interface BrowserResult {
  action: BrowserAction | "compare" | "compare-analyze";
  title: string;
  payload: unknown;
}

export interface BrowserResultCard {
  label: string;
  value: string;
  detail?: string;
}

export interface BrowserResultArtifact {
  label: string;
  value: string;
}

export interface BrowserResultPreview {
  label: string;
  src: string;
}

export interface BrowserResultViewModel {
  cards: BrowserResultCard[];
  artifacts: BrowserResultArtifact[];
  previews: BrowserResultPreview[];
  responseText: string;
  responseTruncated: boolean;
  rawText: string;
  rawTruncated: boolean;
  summary: string;
}

export interface BrowserEvidenceMetadata {
  artifactPaths: string[];
  captureMode: string;
  captureReady?: boolean;
  pageTitle: string;
  url: string;
}

const RAW_RESULT_LIMIT = 12_000;
const RESPONSE_PREVIEW_LIMIT = 1_600;
const IMAGE_PATH_PATTERN =
  /\.(?:apng|avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/iu;

function readableResult(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readableResultSlice(
  value: unknown,
  maxCharacters: number,
): { text: string; truncated: boolean } {
  const text = readableResult(value);
  if (text.length <= maxCharacters) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxCharacters).trimEnd()}\n…`,
    truncated: true,
  };
}

function compactValue(value: string, maxLength = 84): string {
  if (value.length <= maxLength) return value;
  const prefix = Math.max(18, Math.floor((maxLength - 1) / 2));
  const suffix = Math.max(12, maxLength - prefix - 1);
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}

function formatCount(label: string, value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString()} ${label}`
    : null;
}

function formatDelta(label: string, value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value === 0) return `0 ${label}`;
  return `${value > 0 ? "+" : ""}${value.toLocaleString()} ${label}`;
}

function safeImageSource(value: string): string | null {
  if (value.startsWith("data:image/")) return value;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return IMAGE_PATH_PATTERN.test(parsed.pathname) ? value : null;
  } catch {
    return null;
  }
}

function isArtifactLike(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    value.startsWith("data:image/") ||
    /^https?:\/\//iu.test(value)
  );
}

function collectPreviewSources(
  value: unknown,
  trail: string[] = [],
  previews: BrowserResultPreview[] = [],
  seen = new Set<string>(),
  depth = 0,
): BrowserResultPreview[] {
  if (depth > 5) return previews;
  if (typeof value === "string") {
    const preview = safeImageSource(value);
    const key = trail.at(-1) ?? "preview";
    if (preview && !seen.has(preview)) {
      seen.add(preview);
      previews.push({ label: titleCase(key), src: preview });
    }
    return previews;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 20)) {
      collectPreviewSources(entry, trail, previews, seen, depth + 1);
    }
    return previews;
  }
  const record = asRecord(value);
  for (const [key, entry] of Object.entries(record).slice(0, 24)) {
    collectPreviewSources(entry, [...trail, key], previews, seen, depth + 1);
  }
  return previews;
}

export function collectBrowserArtifactPaths(
  value: unknown,
  output: string[] = [],
  depth = 0,
): string[] {
  if (depth > 4 || output.length >= 12) return output;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 20)) {
      collectBrowserArtifactPaths(entry, output, depth + 1);
    }
    return output;
  }
  const record = asRecord(value);
  for (const [key, entry] of Object.entries(record)) {
    if (output.length >= 12) break;
    if (
      typeof entry === "string" &&
      /(path|artifact|manifest|report|snapshot|screenshot)/iu.test(key) &&
      entry.trim()
    ) {
      if (!output.includes(entry.trim())) output.push(entry.trim());
      continue;
    }
    if (entry && typeof entry === "object") {
      collectBrowserArtifactPaths(entry, output, depth + 1);
    }
  }
  return output;
}

export function getBrowserEvidenceMetadata(
  payload: unknown,
): BrowserEvidenceMetadata {
  const root = asRecord(payload);
  const capture = asRecord(root.capture);
  const inspection = asRecord(root.inspection);
  const analysis = asRecord(root.analysis);
  const analysisCapture = asRecord(analysis.capture);
  const primary =
    Object.keys(capture).length > 0
      ? capture
      : Object.keys(analysisCapture).length > 0
        ? analysisCapture
        : inspection;
  const status = asRecord(primary.status);
  const page = asRecord(primary.page);
  return {
    artifactPaths: collectBrowserArtifactPaths(payload),
    captureMode:
      asString(primary.captureMode) ||
      asString(status.captureMode) ||
      asString(root.captureMode) ||
      "structured",
    captureReady:
      typeof status.captureReady === "boolean"
        ? status.captureReady
        : undefined,
    pageTitle: asString(page.title),
    url: asString(page.url),
  };
}

export function buildBrowserResultViewModel(
  result: BrowserResult,
): BrowserResultViewModel {
  const payload = asRecord(result.payload);
  const inspection = asRecord(payload.inspection);
  const capture = asRecord(payload.capture);
  const analysis = asRecord(payload.analysis);
  const rootComparison = asRecord(payload.comparison);
  const comparison =
    Object.keys(rootComparison).length > 0
      ? rootComparison
      : asRecord(analysis.comparison);
  const primaryBundle =
    Object.keys(capture).length > 0
      ? capture
      : Object.keys(asRecord(analysis.capture)).length > 0
        ? asRecord(analysis.capture)
        : inspection;
  const primaryPage = asRecord(primaryBundle.page);
  const responseText = asString(payload.response);
  const cards: BrowserResultCard[] = [];
  const artifacts: BrowserResultArtifact[] = [];
  const previews = collectPreviewSources(result.payload);
  const artifactKeys = new Set<string>();

  const pushCard = (label: string, value: string | null, detail?: string) => {
    if (value) cards.push({ label, value, detail });
  };
  const pushArtifact = (label: string, value: unknown) => {
    if (typeof value !== "string" || !value.trim() || !isArtifactLike(value)) {
      return;
    }
    const key = `${label}:${value}`;
    if (!artifactKeys.has(key)) {
      artifactKeys.add(key);
      artifacts.push({ label, value });
    }
  };

  if (primaryPage.title || primaryPage.url) {
    pushCard(
      "Page",
      asString(primaryPage.title) ||
        compactValue(asString(primaryPage.url), 60),
      asString(primaryPage.url)
        ? compactValue(asString(primaryPage.url), 88)
        : undefined,
    );
  }
  if (primaryPage.provider || primaryPage.mode) {
    pushCard(
      "Renderer",
      [asString(primaryPage.provider), asString(primaryPage.mode)]
        .filter(Boolean)
        .join(" · "),
      displayTimestamp(asString(primaryPage.renderedAt)),
    );
  }
  const contentSummary = [
    typeof primaryPage.contentLength === "number"
      ? `${primaryPage.contentLength.toLocaleString()} chars`
      : null,
    formatCount("lines", primaryPage.lineCount),
  ]
    .filter(Boolean)
    .join(" · ");
  pushCard(
    "Document",
    asString(primaryPage.contentType) || null,
    contentSummary || undefined,
  );
  const structureSummary = [
    formatCount("links", primaryPage.linkCount),
    formatCount("images", primaryPage.imageCount),
    formatCount("headings", primaryPage.headingCount),
  ]
    .filter(Boolean)
    .join(" · ");
  pushCard(
    "Structure",
    formatCount("words", primaryPage.wordCount),
    structureSummary || undefined,
  );
  if (primaryBundle.captureMode || asRecord(primaryBundle.status).captureMode) {
    const status = asRecord(primaryBundle.status);
    pushCard(
      "Capture",
      titleCase(
        asString(primaryBundle.captureMode) || asString(status.captureMode),
      ),
      typeof status.captureReady === "boolean"
        ? status.captureReady
          ? "Capture-ready backend"
          : "Placeholder capture backend"
        : undefined,
    );
  }
  if (Object.keys(analysis).length > 0) {
    const highlights = Array.isArray(analysis.highlights)
      ? analysis.highlights.length
      : 0;
    pushCard(
      "Analysis",
      titleCase(asString(analysis.focus) || "browser"),
      highlights > 0
        ? `${highlights.toLocaleString()} highlight${highlights === 1 ? "" : "s"}`
        : undefined,
    );
  }
  if (responseText) {
    pushCard(
      "Model response",
      `${responseText.length.toLocaleString()} chars`,
      compactValue(responseText.replace(/\s+/gu, " "), 88),
    );
  }
  if (Object.keys(comparison).length > 0) {
    const summary = asRecord(comparison.summary);
    const leftPage = asRecord(asRecord(comparison.left).page);
    const rightPage = asRecord(asRecord(comparison.right).page);
    pushCard(
      "Compare left",
      compactValue(asString(leftPage.title) || asString(leftPage.url), 60) ||
        null,
      asString(leftPage.url)
        ? compactValue(asString(leftPage.url), 88)
        : undefined,
    );
    pushCard(
      "Compare right",
      compactValue(asString(rightPage.title) || asString(rightPage.url), 60) ||
        null,
      asString(rightPage.url)
        ? compactValue(asString(rightPage.url), 88)
        : undefined,
    );
    pushCard(
      "Diff",
      summary.hashChanged ? "Content changed" : "Content matched",
      [
        typeof summary.titleChanged === "boolean"
          ? summary.titleChanged
            ? "title changed"
            : "title stable"
          : null,
        formatDelta("words", summary.wordDelta),
        formatDelta("links", summary.linkDelta),
        formatDelta("images", summary.imageDelta),
        formatDelta("headings", summary.headingDelta),
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    );
  }
  pushArtifact(
    result.action === "snapshot" ? "Snapshot path" : "Artifact path",
    payload.path,
  );
  const collectBundleArtifacts = (
    label: string,
    bundle: Record<string, unknown>,
  ) => {
    if (Object.keys(bundle).length === 0) return;
    pushArtifact(`${label} snapshot`, bundle.snapshotPath);
    pushArtifact(`${label} screenshot`, bundle.screenshotPath);
    pushArtifact(`${label} screenshot SVG`, bundle.screenshotSvgPath);
    pushArtifact(`${label} manifest`, bundle.manifestPath);
    pushArtifact(`${label} report`, bundle.reportPath);
  };
  collectBundleArtifacts("Inspection", inspection);
  collectBundleArtifacts("Capture", capture);
  collectBundleArtifacts("Analysis", asRecord(analysis.capture));
  pushArtifact("Comparison manifest", comparison.manifestPath);
  pushArtifact("Comparison report", comparison.reportPath);
  collectBundleArtifacts("Left capture", asRecord(comparison.left));
  collectBundleArtifacts("Right capture", asRecord(comparison.right));

  const raw = readableResultSlice(result.payload, RAW_RESULT_LIMIT);
  const responsePreview = readableResultSlice(
    responseText,
    RESPONSE_PREVIEW_LIMIT,
  );
  const summaryParts = [
    cards.length
      ? `${cards.length} detail${cards.length === 1 ? "" : "s"}`
      : null,
    artifacts.length
      ? `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}`
      : null,
    previews.length
      ? `${previews.length} preview${previews.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return {
    cards,
    artifacts,
    previews,
    responseText: responseText ? responsePreview.text : "",
    responseTruncated: responseText ? responsePreview.truncated : false,
    rawText: raw.text,
    rawTruncated: raw.truncated,
    summary: summaryParts.join(" · ") || "Structured payload captured",
  };
}
