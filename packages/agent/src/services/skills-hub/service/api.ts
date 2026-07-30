import type { SkillsHubServiceApi } from "./api-types";
import {
  primeCatalogCache,
  rememberSyncReport,
  resetFamilyCache,
} from "./cache";
import {
  exportServiceBundle,
  exportServiceManifest,
  importServiceManifest,
  resolveServiceManifest,
} from "./distribution";
import { writeDistributionProjection } from "./distribution-projection";
import {
  listInstalledRecords,
  mergeInstalledRecords,
  resolveInstalledManifest,
} from "./installed";
import type { SkillHubServiceState } from "./state";
import {
  buildServiceSummary,
  findServiceFamily,
  loadServiceFamilies,
} from "./summary";
import {
  collectGeneratedWorkspaceSkills,
  collectSkillHubWorkspace,
} from "./workspace";

export function createSkillsHubServiceApi(
  state: SkillHubServiceState,
): SkillsHubServiceApi {
  const workspace = () => collectSkillHubWorkspace(state.context);

  const installedManifests = () => listInstalledRecords(state.context);
  const installedRecords = () =>
    mergeInstalledRecords(installedManifests(), state.cache.installed ?? []);

  const installedManifest = (slug: string) =>
    resolveInstalledManifest(state.context, slug);

  const exportManifest: SkillsHubServiceApi["exportManifest"] = (
    slug,
    destinationPath,
  ) =>
    exportServiceManifest({
      context: {
        manifestHost: state.context.manifestHost,
      },
      workspace: workspace(),
      slug,
      destinationPath,
    });

  const project: SkillsHubServiceApi["project"] = (input) => {
    if (input.catalog) {
      primeCatalogCache(state.cache, input.catalog);
    }
    if (input.installed) {
      state.cache.installed = input.installed;
      resetFamilyCache(state.cache);
    }
  };

  const families: SkillsHubServiceApi["families"] = (
    force = false,
    limit = 50,
  ) =>
    loadServiceFamilies({
      cache: state.cache,
      context: {
        paths: state.context.paths,
        skills: state.context.skills,
      },
      workspace: workspace(),
      installed: installedRecords(),
      force,
      limit,
    });

  const exportBundle: SkillsHubServiceApi["exportBundle"] = async (
    label = "skills-hub",
    projection = {},
  ) => {
    project(projection);
    const currentWorkspace = workspace();
    const currentCatalog = state.cache.catalog ?? [];
    const currentInstalled = installedRecords();

    const sync = await writeDistributionProjection({
      workspace: currentWorkspace,
      catalog: currentCatalog,
      installed: currentInstalled,
      manifestsDir: state.context.paths.manifestsDir,
      syncDir: state.context.paths.hubDir,
      exportManifest: (slug) => exportManifest(slug),
    });
    rememberSyncReport(state.cache, sync);
    return exportServiceBundle({
      context: {
        paths: state.context.paths,
      },
      label,
      workspace: currentWorkspace,
      installed: currentInstalled,
      sync,
      exportManifest: (slug) => exportManifest(slug),
    });
  };

  return {
    workspace,
    generated: () => collectGeneratedWorkspaceSkills(workspace()),
    project,
    families,
    family: (slug) =>
      findServiceFamily({
        slug,
        loadFamilies: () => families(false, 500),
      }),
    manifest: (slug) =>
      resolveServiceManifest({
        context: {
          manifestHost: state.context.manifestHost,
        },
        workspace: workspace(),
        slug,
        installedLookup: installedManifest,
      }),
    exportManifest,
    exportBundle,
    importManifest: (sourcePath) =>
      importServiceManifest({
        cache: state.cache,
        context: {
          manifestHost: state.context.manifestHost,
        },
        sourcePath,
      }),
    installedManifests,
    installedManifest,
    summary: (force = false) => {
      const currentWorkspace = workspace();
      const currentInstalled = installedRecords();
      return buildServiceSummary({
        cache: state.cache,
        context: {
          paths: state.context.paths,
        },
        workspace: currentWorkspace,
        installed: currentInstalled,
        families: families(force, 500),
        installedManifest,
      });
    },
  };
}
