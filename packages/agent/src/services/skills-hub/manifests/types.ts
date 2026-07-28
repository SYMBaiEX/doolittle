export interface SkillsHubManifestHost {
  manifestsDir: string;
  importsDir: string;
  installedIndexPath: string;
  nowIso(): string;
  normalizeSlug(value: string): string;
  rootFromSlug(slug: string): string;
  categoryFromSlug(slug: string): string;
  countLines(content: string): number;
  hashContent(content: string): string;
  tagsFromText(content: string): string[];
}
