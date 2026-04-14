export type WorkspaceIntent =
  | { kind: "tree" }
  | { kind: "overview"; path?: string }
  | { kind: "read"; path: string }
  | { kind: "search"; query: string }
  | { kind: "write"; path: string; content: string }
  | { kind: "find-codebase"; query: string };
