export interface WorkspaceFileSaveRequest {
  path: string;
  content: string;
  expectedContent: string;
}
export interface EditorProjectContextRequest {
  workspacePath: string;
  entryPath: string;
  content?: string;
}
export interface EditorProjectCompilerOptions {
  allowJs?: boolean;
  allowSyntheticDefaultImports?: boolean;
  baseUrl?: string;
  esModuleInterop?: boolean;
  jsx?:
    | "none"
    | "preserve"
    | "react"
    | "react-native"
    | "react-jsx"
    | "react-jsxdev";
  lib?: string[];
  module?:
    | "commonjs"
    | "amd"
    | "umd"
    | "system"
    | "es2015"
    | "esnext"
    | "node16"
    | "nodenext"
    | "preserve";
  moduleResolution?: "classic" | "node" | "node16" | "nodenext" | "bundler";
  paths?: Record<string, string[]>;
  resolveJsonModule?: boolean;
  skipLibCheck?: boolean;
  target?:
    | "es3"
    | "es5"
    | "es2015"
    | "es2016"
    | "es2017"
    | "es2018"
    | "es2019"
    | "es2020"
    | "es2022"
    | "esnext";
  types?: string[];
}
export interface EditorProjectSupportFile {
  path: string;
  content: string;
}
export interface EditorProjectContextResult {
  workspacePath: string;
  projectRoot: string;
  entryPath: string;
  tsconfigPath?: string;
  compilerOptions: EditorProjectCompilerOptions;
  supportFiles: EditorProjectSupportFile[];
  truncated: boolean;
}
export type WorkspaceFileSaveResult =
  | { status: "cancelled" }
  | { status: "saved"; path: string }
  | { status: "conflict"; message: string };
