import type { AgentSdkService } from "../../agent-sdk-service";

export type CatalogSkillLike = NonNullable<
  Awaited<ReturnType<AgentSdkService["catalogSkill"]>>
>;

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
  tagsFromCatalog(tags: Record<string, string>): string[];
}
