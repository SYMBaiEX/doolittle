import { getBrowserEvidenceMetadata } from "./browser-result-model";
import { escapeXml } from "./xml-escape";

export const BROWSER_FEEDBACK_COMMENT_LIMIT = 2_000;
export const BROWSER_FEEDBACK_CONTEXT_LIMIT = 8_000;

export interface BrowserEvidenceResult {
  action: string;
  title: string;
  payload: unknown;
}

export interface BrowserEvidenceContextInput {
  result: BrowserEvidenceResult;
  url: string;
  viewport: string;
  comment?: string;
  selector?: string;
  region?: string;
  limit?: number;
}

function escapedBounded(value: string, limit: number): string {
  let output = "";
  for (const character of value.trim()) {
    const next = escapeXml(character);
    if (output.length + next.length > limit) break;
    output += next;
  }
  return output;
}

function bounded(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

/** Builds the exact bounded receipt inserted into the active chat thread. */
export function compileBrowserEvidenceContext(
  input: BrowserEvidenceContextInput,
): string {
  const limit = Math.max(1_000, input.limit ?? BROWSER_FEEDBACK_CONTEXT_LIMIT);
  const metadata = getBrowserEvidenceMetadata(input.result.payload);
  const url = bounded(input.url || metadata.url, 140);
  const title = bounded(metadata.pageTitle, 120);
  const captureMode = bounded(metadata.captureMode, 60);
  const hasPixelEvidence =
    metadata.captureReady !== false &&
    /(browser|pixel|raster|screenshot)/iu.test(captureMode);
  const attributes = [
    `action="${escapedBounded(input.result.action, 60)}"`,
    `title="${escapedBounded(input.result.title, 100)}"`,
    `url="${escapedBounded(url, 140)}"`,
    `viewport="${escapedBounded(input.viewport, 40)}"`,
    `capture_mode="${escapedBounded(captureMode, 60)}"`,
    `pixel_evidence="${hasPixelEvidence ? "available" : "false"}"`,
  ];
  const header = `<browser_evidence version="1" ${attributes.join(" ")}>`;
  const footer = "\n</browser_evidence>";
  const blocks: string[] = [];
  let length = header.length + footer.length;
  const append = (tag: string, value: string, valueLimit: number) => {
    const overhead = tag.length * 2 + 5;
    const available = Math.min(valueLimit, limit - length - overhead);
    if (available <= 0 || !value.trim()) return;
    const text = escapedBounded(value, available);
    if (!text) return;
    const block = `\n<${tag}>${text}</${tag}>`;
    if (length + block.length > limit) return;
    blocks.push(block);
    length += block.length;
  };
  append("page_title", title, 300);
  append(
    "capture",
    hasPixelEvidence
      ? "Artifact-backed browser evidence was captured; inspect the linked artifacts before making visual claims."
      : "Structured or placeholder capture only. Do not infer or claim pixel-level visual evidence.",
    300,
  );
  append("selector", input.selector ?? "", 500);
  append("region", input.region ?? "", 500);
  append(
    "operator_note",
    bounded(input.comment ?? "", BROWSER_FEEDBACK_COMMENT_LIMIT),
    BROWSER_FEEDBACK_COMMENT_LIMIT,
  );
  for (const path of metadata.artifactPaths) {
    const before = length;
    append("artifact", path, 1_000);
    if (length === before) break;
  }
  return `${header}${blocks.join("")}${footer}`;
}
