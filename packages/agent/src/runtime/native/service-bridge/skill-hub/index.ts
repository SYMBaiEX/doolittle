import type { AppServices } from "@/services";
import { getNativeServices, type RuntimeLike } from "../runtime";

export async function getEffectiveSkillCatalog(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 20,
) {
  return (
    (await getNativeServices(runtime).agentSkills?.catalog?.(limit)) ??
    services.skills.catalog(limit)
  );
}

export async function getEffectiveSkillHubCatalog(
  services: AppServices,
  force = false,
  limit = 50,
) {
  return services.skillsHub.catalog(force, limit);
}

export async function searchEffectiveSkillHubCatalog(
  services: AppServices,
  query: string,
  limit = 15,
) {
  return services.skillsHub.searchCatalog(query, limit);
}

export function getEffectiveSkillHubSummary(services: AppServices) {
  return services.skillsHub.summary();
}

export function getEffectiveSkillHubWorkspace(services: AppServices) {
  return services.skillsHub.workspace();
}

export function getEffectiveSkillHubGenerated(services: AppServices) {
  return services.skillsHub.generated();
}

export function getEffectiveSkillHubFamilies(
  services: AppServices,
  limit = 50,
) {
  return services.skillsHub.families(false, limit);
}

export function getEffectiveSkillHubFamily(
  services: AppServices,
  slug: string,
) {
  return services.skillsHub.family(slug);
}

export function getEffectiveSkillHubInstalled(services: AppServices) {
  return services.skillsHub.installedManifests();
}

export function getEffectiveSkillHubInstalledManifest(
  services: AppServices,
  slug: string,
) {
  return services.skillsHub.installedManifest(slug);
}

export async function syncEffectiveSkillHub(
  services: AppServices,
  force = false,
) {
  return services.skillsHub.syncCatalog(force);
}

export function exportEffectiveSkillHubManifest(
  services: AppServices,
  slug: string,
  destinationPath?: string,
) {
  return services.skillsHub.exportManifest(slug, destinationPath);
}

export function importEffectiveSkillHubManifest(
  services: AppServices,
  sourcePath: string,
) {
  return services.skillsHub.importManifest(sourcePath);
}

export function installEffectiveSkillHubManifest(
  services: AppServices,
  slug: string,
) {
  return services.skillsHub.installFromCatalog(slug);
}

export async function searchEffectiveSkillCatalog(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 15,
) {
  return (
    (await getNativeServices(runtime).agentSkills?.searchCatalog?.(
      query,
      limit,
    )) ?? services.skills.searchCatalog(query, limit)
  );
}
