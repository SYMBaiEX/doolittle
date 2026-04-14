import type { DiagnosticCheck } from "@/types";
import type { ProviderOwnershipContext } from "../types";

export function buildEcosystemChecks(
  context: ProviderOwnershipContext,
): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const registrySnapshot = context.ecosystem?.registry;
  const skillCatalog = context.ecosystem?.skillCatalog;
  const { compatibility, workspaceEcosystem } = context;

  checks.push(
    {
      id: "ecosystem.registry",
      status: registrySnapshot?.available ? "pass" : "warn",
      summary: "ElizaOS registry snapshot",
      detail: registrySnapshot?.available
        ? `Registry snapshot available with ${registrySnapshot.total} entries and ${registrySnapshot.nonAppPlugins} non-app plugins.`
        : `Registry snapshot unavailable: ${registrySnapshot?.error ?? "unknown error"}`,
    },
    {
      id: "ecosystem.skills.catalog",
      status: skillCatalog?.available ? "pass" : "warn",
      summary: "ElizaOS skill catalog",
      detail: skillCatalog?.available
        ? `Skill catalog available with ${skillCatalog.total} cached skills.`
        : `Skill catalog unavailable: ${skillCatalog?.error ?? "unknown error"}`,
    },
    {
      id: "ecosystem.compatibility",
      status: compatibility
        ? compatibility.compatible
          ? "pass"
          : "warn"
        : "warn",
      summary: "ElizaOS plugin compatibility",
      detail: compatibility
        ? compatibility.compatible
          ? `All ${compatibility.checked} checked plugins are compatible with core ${compatibility.coreVersion}.`
          : `${compatibility.failures}/${compatibility.checked} plugins need attention for core ${compatibility.coreVersion}: ${compatibility.failing.map((entry) => entry.plugin).join(", ")}`
        : "Compatibility report unavailable.",
    },
  );

  if (!workspaceEcosystem) {
    return checks;
  }

  checks.push(
    {
      id: "ecosystem.workspace.benchmarks",
      status: workspaceEcosystem.benchmarkPacks > 0 ? "pass" : "warn",
      summary: "Benchmark workspace packs",
      detail: `benchmark packs=${workspaceEcosystem.benchmarkPacks}`,
    },
    {
      id: "ecosystem.workspace.distributions",
      status: workspaceEcosystem.distributionChannels > 0 ? "pass" : "warn",
      summary: "Distribution workspace channels",
      detail: `distribution channels=${workspaceEcosystem.distributionChannels}`,
    },
    {
      id: "ecosystem.workspace.modeling",
      status: workspaceEcosystem.modelingProfiles > 0 ? "pass" : "warn",
      summary: "Modeling workspace profiles",
      detail: `modeling profiles=${workspaceEcosystem.modelingProfiles}`,
    },
  );

  return checks;
}
