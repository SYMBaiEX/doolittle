export type WorkspaceIntent =
  | { kind: "tree" }
  | { kind: "overview"; path?: string }
  | { kind: "find-codebase"; query: string };
