import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { getNativeEcosystemSnapshot } from "@doolittle/agent/runtime/native/service-bridge/ownership";
import {
  clipControlDeckLine,
  clipControlDeckText,
  escapeControlDeckBlessed,
  normalizeControlDeckWidth,
  renderControlDeckHeading,
} from "./width";

function fitPlainLine(text: string, width: number): string {
  return clipControlDeckLine(text, width);
}

function renderServiceCountLine(
  nativeCount: number,
  totalCount: number,
  width: number,
): string {
  const full = `Native services: ${nativeCount}/${totalCount}`;
  if (full.length <= width) {
    return full;
  }
  return fitPlainLine(`Native: ${nativeCount}/${totalCount}`, width);
}

function renderSkillPackLine(count: number, width: number): string {
  const full = `Optional skill packs: ${count}`;
  if (full.length <= width) {
    return full;
  }
  return fitPlainLine(`Skill packs: ${count}`, width);
}

function renderPackageRow(
  entry: {
    packageName: string;
    compatibility: string;
    currentTag: string;
  },
  width: number,
): string {
  if (width < 32) {
    return `- ${escapeControlDeckBlessed(clipControlDeckText(entry.packageName, width - 2))}`;
  }

  const compatibility = ` [${entry.compatibility}]`;
  const mediumNameWidth = width - 2 - compatibility.length;
  if (width < 56 || mediumNameWidth < 8) {
    if (mediumNameWidth >= 4) {
      const name = clipControlDeckText(entry.packageName, mediumNameWidth);
      return `- ${escapeControlDeckBlessed(name)}{gray-fg}${compatibility}{/}`;
    }
    return `- ${escapeControlDeckBlessed(clipControlDeckText(entry.packageName, width - 2))}`;
  }

  const tagWidth = entry.currentTag.length + 1;
  const nameWidth = width - 2 - compatibility.length - tagWidth;
  if (nameWidth < 8) {
    const name = clipControlDeckText(entry.packageName, mediumNameWidth);
    return `- ${escapeControlDeckBlessed(name)}{gray-fg}${compatibility}{/}`;
  }
  const name = clipControlDeckText(entry.packageName, nameWidth);
  return `- ${escapeControlDeckBlessed(name)}{gray-fg}${compatibility} ${escapeControlDeckBlessed(entry.currentTag)}{/}`;
}

export async function renderEcosystemContent(
  context: AppContext,
  width = 80,
): Promise<string> {
  const contentWidth = normalizeControlDeckWidth(width);
  const snapshot = await getNativeEcosystemSnapshot(
    context.runtime,
    context.services,
    context.config,
    context.services.gatewayConfig,
  );
  const audit = snapshot.packageAudit;
  const resolution = snapshot.ownership.controlPlane.serviceResolution;
  const ecosystem = snapshot.workspace.summary;
  const latest = snapshot.runtime.latest;
  const beta = snapshot.runtime.beta;
  const aligned = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "aligned",
  ).length;
  const betaOnly = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "beta-only",
  ).length;
  const laggingLatest = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "lagging-latest",
  ).length;
  const vendored = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "vendored-by-design",
  ).length;
  const workspaceOnly = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "workspace-only",
  ).length;
  const nativeCount = resolution.filter(
    (entry) => entry.source === "native",
  ).length;

  return [
    renderControlDeckHeading("Runtime Line", "Runtime", contentWidth),
    `Latest: {cyan-fg}${escapeControlDeckBlessed(clipControlDeckText(latest, contentWidth - "Latest: ".length))}{/}`,
    `Beta: {green-fg}${escapeControlDeckBlessed(clipControlDeckText(beta, contentWidth - "Beta: ".length))}{/}`,
    "",
    renderControlDeckHeading("Package Audit", "Packages", contentWidth),
    fitPlainLine(`Aligned: ${aligned}`, contentWidth),
    fitPlainLine(`Beta-only: ${betaOnly}`, contentWidth),
    fitPlainLine(`Lagging latest: ${laggingLatest}`, contentWidth),
    fitPlainLine(`Vendored: ${vendored}`, contentWidth),
    fitPlainLine(`Workspace-only: ${workspaceOnly}`, contentWidth),
    renderServiceCountLine(nativeCount, resolution.length, contentWidth),
    renderSkillPackLine(ecosystem.optionalSkillPacks, contentWidth),
    "",
    renderControlDeckHeading("Priority Packages", "Priority", contentWidth),
    ...snapshot.packageAudit.packages
      .slice(0, 6)
      .map((entry) => renderPackageRow(entry, contentWidth)),
  ].join("\n");
}
