import type { AppContext } from "@/runtime/bootstrap";
import { getNativeEcosystemSnapshot } from "@/runtime/native/service-bridge/ownership";

export async function renderEcosystemContent(
  context: AppContext,
): Promise<string> {
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

  return [
    "{bold}Runtime Line{/}",
    `Latest: {cyan-fg}${latest}{/}`,
    `Beta: {green-fg}${beta}{/}`,
    "",
    "{bold}Package Audit{/}",
    `Aligned: ${aligned}`,
    `Beta-only: ${betaOnly}`,
    `Lagging latest: ${laggingLatest}`,
    `Vendored: ${vendored}`,
    `Workspace-only: ${workspaceOnly}`,
    `Native services: ${resolution.filter((entry) => entry.source === "native").length}/${resolution.length}`,
    `Workspace packs: benchmarks=${ecosystem.benchmarkPacks} channels=${ecosystem.distributionChannels} modeling=${ecosystem.modelingProfiles} optional=${ecosystem.optionalSkillPacks}`,
    "",
    "{bold}Priority Packages{/}",
    ...snapshot.packageAudit.packages
      .slice(0, 6)
      .map(
        (entry) =>
          `- ${entry.packageName} {gray-fg}[${entry.compatibility}] ${entry.currentTag}{/}`,
      ),
  ].join("\n");
}
