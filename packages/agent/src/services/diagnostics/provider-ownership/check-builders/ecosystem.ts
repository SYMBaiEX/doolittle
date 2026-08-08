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
        ? `Official skill catalog projection contains ${skillCatalog.total} skills.`
        : `Official skill catalog projection unavailable: ${skillCatalog?.error ?? "unknown error"}`,
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

  checks.push({
    id: "ecosystem.workspace.optional-skills",
    status: workspaceEcosystem.optionalSkillPacks > 0 ? "pass" : "warn",
    summary: "Optional native skill packs",
    detail: `optional skill packs=${workspaceEcosystem.optionalSkillPacks}`,
  });

  return checks;
}
