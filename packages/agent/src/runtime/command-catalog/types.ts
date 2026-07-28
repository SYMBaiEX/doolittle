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
  /** Alternate command spellings that resolve to this command, when any. */
  aliases?: string[];
  /** Present only when a catalogued command cannot run in this runtime. */
  disabledReason?: string;
}
