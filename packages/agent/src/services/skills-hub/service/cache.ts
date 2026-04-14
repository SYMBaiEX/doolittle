import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubSyncReport,
} from "../types";
import type { SkillHubServiceCache } from "./state";

export function resetFamilyCache(cache: SkillHubServiceCache): void {
  cache.families = undefined;
}

export function resetCatalogCache(cache: SkillHubServiceCache): void {
  cache.catalog = undefined;
  resetFamilyCache(cache);
}

export function primeCatalogCache(
  cache: SkillHubServiceCache,
  catalog: SkillHubCatalogRecord[],
): SkillHubCatalogRecord[] {
  cache.catalog = catalog;
  resetFamilyCache(cache);
  return cache.catalog;
}

export function rememberFamilies(
  cache: SkillHubServiceCache,
  families: SkillHubFamilyRecord[],
): SkillHubFamilyRecord[] {
  cache.families = families;
  return cache.families;
}

export function rememberSyncReport(
  cache: SkillHubServiceCache,
  report: SkillHubSyncReport,
): SkillHubSyncReport {
  cache.lastSyncReport = report;
  resetFamilyCache(cache);
  return report;
}
