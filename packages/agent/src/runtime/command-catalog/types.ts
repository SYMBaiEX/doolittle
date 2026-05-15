export interface CommandCatalogEntry {
  command: string;
  category:
    | "runtime"
    | "gateway"
    | "memory"
    | "skills"
    | "browser"
    | "media"
    | "execution"
    | "tools"
    | "delegation"
    | "research"
    | "workspace"
    | "workflow";
  description: string;
}
