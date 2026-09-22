export type WorkspaceIntent =
  | { kind: "tree"; path?: string }
  | { kind: "overview"; path?: string }
  | { kind: "find-codebase"; query: string };
