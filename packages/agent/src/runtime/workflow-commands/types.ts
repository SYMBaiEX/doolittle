export interface WorkflowCommandCatalogEntry {
  command: string;
  category: "workflow";
  description: string;
}

export interface WorkflowCommandDefinition {
  command: string;
  title: string;
  description: string;
  markdown: string;
}

export interface WorkflowCommandSeed {
  fileName: string;
  fallback: string;
}

export interface ParsedWorkflowFrontmatter {
  command?: string;
  title?: string;
  description?: string;
  body: string;
}
