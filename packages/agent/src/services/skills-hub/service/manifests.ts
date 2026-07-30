import { writeSkillHubBundle } from "../distribution-artifacts";
import type { SkillsHubManifestHost } from "../manifests";
import {
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

  throw new Error(
    `Local skill manifest unavailable: ${input.slug}. Catalog skills must be installed through the official Agent Skills service before export.`,
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
