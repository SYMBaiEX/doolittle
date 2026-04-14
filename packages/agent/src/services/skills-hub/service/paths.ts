import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface SkillHubServicePaths {
  hubDir: string;
  manifestsDir: string;
  installsDir: string;
  exportsDir: string;
  importsDir: string;
  familyIndexPath: string;
  familyReadmePath: string;
  installedIndexPath: string;
  catalogIndexPath: string;
}

export function buildSkillHubServicePaths(
  baseDir: string,
  skillsRootDir: string,
): SkillHubServicePaths {
  const hubDir = join(baseDir, "skills-hub");
  const installsDir = join(hubDir, "installs");
  return {
    hubDir,
    manifestsDir: join(hubDir, "manifests"),
    installsDir,
    exportsDir: join(hubDir, "exports"),
    importsDir: join(hubDir, "imports"),
    familyIndexPath: join(skillsRootDir, "index.md"),
    familyReadmePath: join(skillsRootDir, "README.md"),
    installedIndexPath: join(installsDir, "index.json"),
    catalogIndexPath: join(hubDir, "catalog.json"),
  };
}

export function ensureSkillHubServicePaths(paths: SkillHubServicePaths): void {
  mkdirSync(paths.manifestsDir, { recursive: true });
  mkdirSync(paths.installsDir, { recursive: true });
  mkdirSync(paths.exportsDir, { recursive: true });
  mkdirSync(paths.importsDir, { recursive: true });
}
