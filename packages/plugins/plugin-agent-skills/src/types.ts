export interface SkillDocument {
  slug: string;
  title: string;
  description: string;
  path: string;
  content: string;
  source?: "workspace" | "generated" | "bundled" | "managed" | "project";
  commandName?: string;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
}

export interface SkillsServiceLike {
  list(): SkillDocument[];
  get(slug: string): SkillDocument | undefined;
  catalog(limit?: number): Promise<unknown>;
  searchCatalog(query: string, limit?: number): Promise<unknown>;
}
