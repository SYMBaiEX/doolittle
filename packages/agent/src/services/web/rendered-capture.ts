import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  closeBrowserWorkspaceTab,
  getBrowserWorkspaceSnapshot,
  openBrowserWorkspaceTab,
  snapshotBrowserWorkspaceTab,
} from "@elizaos/plugin-browser";
import type { ModelAnalysisImage } from "../model-analysis-port";
import type {
  BrowserConfig,
  BrowserInspection,
  BrowserStatus,
  WebPageSnapshot,
} from "./service-types";

export interface RenderedPageFacts {
  url: string;
  title: string;
  text: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  horizontalOverflow: boolean;
  counts: {
    main: number;
    h1: number;
    links: number;
    images: number;
    headings: number;
  };
  headings: string[];
  links: Array<{
    label: string;
    href: string;
    targetExists: boolean | null;
    targetText: string | null;
  }>;
  images: Array<{ alt: string; loaded: boolean }>;
  contrastCandidates: Array<{
    text: string;
    foreground: string;
    background: string | null;
    fontSize: string;
    fontWeight: string;
  }>;
  limitations: string[];
}

export interface RenderedEvidence {
  backend: "electron-private-capture";
  scope: "viewport-only-read-only";
  viewport: { width: number; height: number };
  pixels: { width: number; height: number; bytes: number; sha256: string };
  blockedRequests: number;
  facts: RenderedPageFacts;
}

export interface RenderedPageCapture {
  image: ModelAnalysisImage;
  evidence: RenderedEvidence;
}

export interface RenderedCapturePort {
  available(): Promise<boolean>;
  capture(
    url: string,
    viewport: { width: number; height: number },
    abortSignal?: AbortSignal,
  ): Promise<RenderedPageCapture>;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_BYTES = 10 * 1024 * 1024;
const MAX_ENCODED_BYTES = Math.ceil(MAX_PNG_BYTES / 3) * 4;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid rendered evidence.");
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid rendered text bounds.");
  return value;
}

function count(value: unknown, max = 100_000): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    throw new Error("Invalid rendered count.");
  return value;
}

function list<T>(
  value: unknown,
  max: number,
  parse: (value: unknown) => T,
): T[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error("Invalid rendered collection.");
  return value.map(parse);
}

export function validateRenderedCapture(
  value: unknown,
  target: string,
  viewport: { width: number; height: number },
): RenderedPageCapture {
  const payload = record(value);
  if (
    payload.captureMode !== "rendered-page" ||
    payload.captureProtocol !== "doolittle-rendered-page-v1" ||
    payload.scope !== "viewport-only-read-only"
  )
    throw new Error("Rendered capture protocol is unavailable.");
  const requested = record(payload.viewport);
  if (
    requested.width !== viewport.width ||
    requested.height !== viewport.height
  )
    throw new Error("Rendered viewport mismatch.");
  const encoded = text(payload.data, MAX_ENCODED_BYTES);
  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)
  )
    throw new Error("Invalid rendered PNG encoding.");
  const png = Buffer.from(encoded, "base64");
  if (
    png.length < 33 ||
    png.length > MAX_PNG_BYTES ||
    !png.subarray(0, 8).equals(PNG_SIGNATURE) ||
    png.toString("ascii", 12, 16) !== "IHDR" ||
    png.toString("base64") !== encoded
  )
    throw new Error("Invalid rendered PNG.");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const raw = record(payload.facts);
  const rawViewport = record(raw.viewport);
  const deviceScaleFactor = rawViewport.deviceScaleFactor;
  if (
    rawViewport.width !== viewport.width ||
    rawViewport.height !== viewport.height ||
    typeof deviceScaleFactor !== "number" ||
    !Number.isFinite(deviceScaleFactor) ||
    deviceScaleFactor < 1 ||
    deviceScaleFactor > 4 ||
    Math.abs(width - viewport.width * deviceScaleFactor) > 1 ||
    Math.abs(height - viewport.height * deviceScaleFactor) > 1
  )
    throw new Error("Rendered PNG dimensions do not match the viewport.");
  const url = text(raw.url, 4096);
  const actual = new URL(url);
  if (
    actual.origin !== new URL(target).origin ||
    actual.username ||
    actual.password
  )
    throw new Error("Rendered URL escaped the managed origin.");
  const counts = record(raw.counts);
  if (typeof raw.horizontalOverflow !== "boolean")
    throw new Error("Invalid rendered overflow fact.");
  const facts: RenderedPageFacts = {
    url,
    title: text(raw.title, 300),
    text: text(raw.text, 16000),
    viewport: { ...viewport, deviceScaleFactor },
    horizontalOverflow: raw.horizontalOverflow,
    counts: {
      main: count(counts.main),
      h1: count(counts.h1),
      links: count(counts.links),
      images: count(counts.images),
      headings: count(counts.headings),
    },
    headings: list(raw.headings, 40, (item) => text(item, 200)),
    links: list(raw.links, 80, (item) => {
      const link = record(item);
      if (link.targetExists !== null && typeof link.targetExists !== "boolean")
        throw new Error("Invalid rendered link fact.");
      return {
        label: text(link.label, 200),
        href: text(link.href, 2048),
        targetExists: link.targetExists,
        targetText:
          link.targetText === null ? null : text(link.targetText, 200),
      };
    }),
    images: list(raw.images, 40, (item) => {
      const image = record(item);
      if (typeof image.loaded !== "boolean")
        throw new Error("Invalid rendered image fact.");
      return { alt: text(image.alt, 200), loaded: image.loaded };
    }),
    contrastCandidates: list(raw.contrastCandidates, 120, (item) => {
      const contrast = record(item);
      return {
        text: text(contrast.text, 80),
        foreground: text(contrast.foreground, 100),
        background:
          contrast.background === null ? null : text(contrast.background, 100),
        fontSize: text(contrast.fontSize, 40),
        fontWeight: text(contrast.fontWeight, 40),
      };
    }),
    limitations: list(raw.limitations, 10, (item) => text(item, 400)),
  };
  return {
    image: { data: png, mediaType: "image/png" },
    evidence: {
      backend: "electron-private-capture",
      scope: "viewport-only-read-only",
      viewport,
      pixels: {
        width,
        height,
        bytes: png.length,
        sha256: createHash("sha256").update(png).digest("hex"),
      },
      blockedRequests: count(payload.blockedRequests),
      facts,
    },
  };
}

/** Thin official SDK client, with no profile, evaluation or navigation API. */
export function createSdkRenderedCapturePort(
  environment: NodeJS.ProcessEnv = process.env,
): RenderedCapturePort | undefined {
  let url: URL;
  try {
    url = new URL(environment.ELIZA_BROWSER_WORKSPACE_URL ?? "");
  } catch {
    return undefined;
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^[a-f0-9]{64}$/u.test(environment.ELIZA_BROWSER_WORKSPACE_TOKEN ?? "")
  )
    return undefined;
  // Snapshot only the two private capability fields, not the host environment.
  const env = {
    ELIZA_BROWSER_WORKSPACE_URL: url.origin,
    ELIZA_BROWSER_WORKSPACE_TOKEN: environment.ELIZA_BROWSER_WORKSPACE_TOKEN,
  };
  return {
    async available() {
      try {
        return (await getBrowserWorkspaceSnapshot(env)).mode === "desktop";
      } catch {
        return false;
      }
    },
    async capture(target, viewport, abortSignal) {
      abortSignal?.throwIfAborted();
      let id: string | undefined;
      try {
        const tab = await openBrowserWorkspaceTab(
          { url: target, ...viewport, show: false },
          env,
        );
        id = tab.id;
        abortSignal?.throwIfAborted();
        const value: unknown = await snapshotBrowserWorkspaceTab(id, env);
        abortSignal?.throwIfAborted();
        return validateRenderedCapture(value, target, viewport);
      } finally {
        // The bridge TTL also closes a tab if a request loses its response.
        if (id) await closeBrowserWorkspaceTab(id, env).catch(() => false);
      }
    },
  };
}

export function writeRenderedInspection(
  capture: RenderedPageCapture,
  config: BrowserConfig,
  outputDir: string,
  status: BrowserStatus,
): BrowserInspection {
  const base = join(outputDir, `rendered-${randomUUID()}`);
  const screenshotPath = `${base}.png`;
  const snapshotPath = `${base}.md`;
  const facts = capture.evidence.facts;
  const page: WebPageSnapshot = {
    url: facts.url,
    title: facts.title,
    text: facts.text,
    provider: config.provider,
    mode: "browser",
    renderedAt: new Date().toISOString(),
    contentType: "text/html",
    contentLength: Buffer.byteLength(facts.text),
    wordCount: facts.text.trim().split(/\s+/u).filter(Boolean).length,
    lineCount: facts.text.split("\n").length,
    linkCount: facts.counts.links,
    imageCount: facts.counts.images,
    headingCount: facts.counts.headings,
    contentHash: createHash("sha256").update(facts.text).digest("hex"),
  };
  writeFileSync(screenshotPath, capture.image.data, { mode: 0o600 });
  writeFileSync(
    snapshotPath,
    [
      "# Rendered page evidence",
      "",
      `URL: ${facts.url}`,
      `Viewport: ${capture.evidence.viewport.width} × ${capture.evidence.viewport.height} CSS pixels`,
      "Private Electron capture; fetched-text provider setting is unchanged.",
      "Viewport-only, no keyboard/click/form/motion testing.",
      `Blocked requests: ${capture.evidence.blockedRequests}`,
      "",
      facts.text,
    ].join("\n"),
    { mode: 0o600 },
  );
  return {
    page,
    snapshotPath,
    screenshotPath,
    screenshotSvgPath: "",
    captureMode: "rendered-page",
    renderedEvidence: capture.evidence,
    status: {
      ...status,
      renderBackend: "electron-private-capture",
      captureMode: "rendered-page",
      captureReady: true,
      detail:
        "Private rendered capture of a managed app; viewport-only, no interaction testing.",
    },
  };
}
