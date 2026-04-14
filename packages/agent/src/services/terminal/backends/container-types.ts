export type ContainerBackendName = "docker" | "podman";

export interface ContainerBackendSpec {
  readonly name: ContainerBackendName;
  readonly label: string;
  readonly previewDetail: string;
  readonly versionCommand: string[];
  readonly installHint: string;
  readonly verifyHint: string;
}
