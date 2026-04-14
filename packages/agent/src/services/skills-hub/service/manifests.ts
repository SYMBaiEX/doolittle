import { writeSkillHubBundle } from "../catalog-sync";
import type { SkillsHubManifestHost } from "../manifests";
import {
  buildSkillHubCatalogManifest,
  buildSkillHubManifestFromWorkspace,
  writeSkillHubManifest,
} from "../manifests";
import type {
  SkillHubInstalledRecord,
  SkillHubManifest,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "../types";
import { resolveWorkspaceSkill } from "./workspace";

export function resolveManifestInput(input: {
  workspace: SkillHubWorkspaceRecord[];
  manifestHost: SkillsHubManifestHost;
  slug: string;
  installedLookup: (slug: string) => SkillHubManifest | undefined;
}): SkillHubManifest | undefined {
  const workspaceSkill = resolveWorkspaceSkill(input.workspace, input.slug);
  if (workspaceSkill) {
    return buildSkillHubManifestFromWorkspace(
      input.manifestHost,
      workspaceSkill,
    );
  }
  return input.installedLookup(input.slug);
}

export function exportManifest(input: {
  workspace: SkillHubWorkspaceRecord[];
  manifestHost: SkillsHubManifestHost;
  slug: string;
  destinationPath?: string;
}): SkillHubManifest {
  const workspaceSkill = resolveWorkspaceSkill(input.workspace, input.slug);
  if (workspaceSkill) {
    const manifest = buildSkillHubManifestFromWorkspace(
      input.manifestHost,
      workspaceSkill,
    );
    return writeSkillHubManifest(
      input.destinationPath ?? manifest.path,
      manifest,
    );
  }

  const manifest = buildSkillHubCatalogManifest(input.manifestHost, input.slug);
  return writeSkillHubManifest(
    input.destinationPath ?? manifest.path,
    manifest,
  );
}

export function writeBundle(input: {
  exportsDir: string;
  label: string;
  workspace: SkillHubWorkspaceRecord[];
  installed: SkillHubInstalledRecord[];
  sync: SkillHubSyncReport;
  exportManifest(slug: string): SkillHubManifest;
}) {
  return writeSkillHubBundle({
    exportsDir: input.exportsDir,
    label: input.label,
    workspace: input.workspace,
    installed: input.installed,
    sync: input.sync,
    exportManifest: input.exportManifest,
  });
}
