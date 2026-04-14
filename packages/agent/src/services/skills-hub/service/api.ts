import type { SkillsHubServiceApi } from "./api-types";
import { searchCatalog } from "./catalog";
import {
  loadServiceCatalog,
  loadServiceCatalogEntry,
  syncServiceCatalog,
} from "./catalog-runtime";
import {
  exportServiceBundle,
  exportServiceManifest,
  importServiceManifest,
  installServiceCatalogEntry,
  resolveServiceManifest,
} from "./distribution";
import { listInstalledRecords, resolveInstalledManifest } from "./installed";
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

  const catalog: SkillsHubServiceApi["catalog"] = async (
    force = false,
    limit = 50,
  ) =>
    loadServiceCatalog({
      cache: state.cache,
      context: {
        agentSdk: state.context.agentSdk,
        paths: state.context.paths,
      },
      workspace: workspace(),
      force,
      limit,
    });

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
      installed: installedManifests(),
      force,
      limit,
    });

  const syncCatalog: SkillsHubServiceApi["syncCatalog"] = async (
    force = false,
  ) => {
    const currentWorkspace = workspace();
    const currentCatalog = await catalog(force, 500);
    const currentInstalled = installedManifests();

    return syncServiceCatalog({
      cache: state.cache,
      context: {
        paths: state.context.paths,
      },
      workspace: currentWorkspace,
      catalog: currentCatalog,
      installed: currentInstalled,
      exportManifest: (slug) => exportManifest(slug),
    });
  };

  return {
    workspace,
    generated: () => collectGeneratedWorkspaceSkills(workspace()),
    families,
    family: (slug) =>
      findServiceFamily({
        slug,
        loadFamilies: () => families(false, 500),
      }),
    catalog,
    searchCatalog: (query, limit = 15) =>
      searchCatalog(state.context, query, limit),
    sync: (force = false) => syncCatalog(force),
    syncCatalog,
    manifest: (slug) =>
      resolveServiceManifest({
        context: {
          manifestHost: state.context.manifestHost,
        },
        workspace: workspace(),
        slug,
        installedLookup: installedManifest,
      }),
    catalogEntry: (slug) =>
      loadServiceCatalogEntry({
        context: {
          agentSdk: state.context.agentSdk,
          paths: state.context.paths,
        },
        slug,
        workspace: workspace(),
      }),
    exportManifest,
    exportBundle: async (label = "skills-hub") => {
      const sync = await syncCatalog();
      return exportServiceBundle({
        context: {
          paths: state.context.paths,
        },
        label,
        workspace: workspace(),
        installed: installedManifests(),
        sync,
        exportManifest: (slug) => exportManifest(slug),
      });
    },
    importManifest: (sourcePath) =>
      importServiceManifest({
        cache: state.cache,
        context: {
          manifestHost: state.context.manifestHost,
        },
        sourcePath,
      }),
    installFromCatalog: (slug) =>
      installServiceCatalogEntry({
        context: state.context,
        slug,
        importManifest: (sourcePath) =>
          importServiceManifest({
            cache: state.cache,
            context: {
              manifestHost: state.context.manifestHost,
            },
            sourcePath,
          }),
      }),
    installedManifests,
    installedManifest,
    summary: (force = false) => {
      const currentWorkspace = workspace();
      const currentInstalled = installedManifests();
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
