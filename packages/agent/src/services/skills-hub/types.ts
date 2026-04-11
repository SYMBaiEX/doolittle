export interface SkillHubWorkspaceRecord {
  slug: string;
  title: string;
  description: string;
  path: string;
  root: string;
  category: string;
  tags: string[];
  source: "workspace" | "generated";
  installable: boolean;
  contentLength: number;
  lineCount: number;
  hash: string;
  manifestPath: string;
  taskId?: string;
  objective?: string;
  updatedAt?: string;
}

export interface SkillHubCatalogRecord {
  slug: string;
  displayName: string;
  summary: string | null;
  tags: Record<string, string>;
  tagList: string[];
  installsCurrent: number;
  installsAllTime: number;
  stars: number;
  versions: number;
  installed: boolean;
  workspacePath?: string;
  manifestPath: string;
  source: "catalog" | "workspace";
}

export interface SkillHubDistributionRecord {
  sources: Array<{
    source: "workspace" | "generated" | "catalog" | "installed";
    count: number;
  }>;
  categories: Array<{
    name: string;
    count: number;
    workspace: number;
    generated: number;
    catalog: number;
    installed: number;
  }>;
  roots: Array<{
    name: string;
    count: number;
    workspace: number;
    generated: number;
    catalog: number;
    installed: number;
  }>;
  tags: Array<{
    name: string;
    count: number;
    workspace: number;
    generated: number;
    catalog: number;
    installed: number;
  }>;
}

export interface SkillHubFamilyRecord {
  slug: string;
  title: string;
  description: string;
  path: string;
  kind: "curated" | "generated";
  workspaceTotal: number;
  generatedTotal: number;
  catalogTotal: number;
  installedTotal: number;
  recent: Array<{
    slug: string;
    title: string;
    category: string;
    root: string;
    source: "workspace" | "generated" | "catalog" | "installed";
  }>;
}

export interface SkillHubSummary {
  workspaceTotal: number;
  generatedTotal: number;
  catalogTotal: number;
  installedTotal: number;
  installable: number;
  exportedManifests: number;
  familyTotal: number;
  curatedFamilyTotal: number;
  generatedFamilyTotal: number;
  manifestsDir: string;
  summary: string;
  distribution: SkillHubDistributionRecord;
  families: SkillHubFamilyRecord[];
  recentWorkspace: Array<{
    slug: string;
    title: string;
    category: string;
    root: string;
    source: "workspace" | "generated";
    tags: string[];
  }>;
  recentCatalog: Array<{
    slug: string;
    displayName: string;
    source: "catalog" | "workspace";
    installed: boolean;
    tags: string[];
  }>;
  recentInstalled: Array<{
    slug: string;
    title: string;
    source: string;
    category: string;
    root: string;
    tags: string[];
  }>;
}

export interface SkillHubManifest {
  kind: "skill-manifest";
  slug: string;
  title: string;
  description: string;
  source: "workspace" | "generated" | "catalog" | "installed";
  path: string;
  root: string;
  category: string;
  installable: boolean;
  content: string;
  contentLength: number;
  lineCount: number;
  hash: string;
  tags: string[];
  tagList?: string[];
  generatedAt: string;
  workspacePath?: string;
  taskId?: string;
  objective?: string;
  catalog?: {
    displayName: string;
    summary: string | null;
    installsCurrent: number;
    installsAllTime: number;
    stars: number;
    versions: number;
  };
}

export interface SkillHubSyncReport {
  refreshedAt: string;
  workspaceTotal: number;
  generatedTotal: number;
  catalogTotal: number;
  installedTotal: number;
  shared: string[];
  localOnly: string[];
  catalogOnly: string[];
  installable: number;
  exportedManifests: number;
  manifestsDir: string;
  summary: string;
}

export interface SkillHubImportResult {
  sourcePath: string;
  manifestPath: string;
  skillPath: string;
  slug: string;
  title: string;
  source: string;
}
