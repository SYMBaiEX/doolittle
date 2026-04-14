import type { ContainerBackendSpec } from "./container-types";

export const DOCKER_BACKEND_SPEC: ContainerBackendSpec = {
  name: "docker",
  label: "Docker",
  previewDetail:
    "Docker execution wraps the workspace in a container with hardened defaults.",
  versionCommand: ["docker", "version", "--format", "{{.Server.Version}}"],
  installHint: "Install Docker and make sure the daemon is running.",
  verifyHint:
    "Verify the Docker daemon is healthy and reachable from this host.",
};

export const PODMAN_BACKEND_SPEC: ContainerBackendSpec = {
  name: "podman",
  label: "Podman",
  previewDetail:
    "Podman execution mirrors the Docker path with rootless-friendly defaults.",
  versionCommand: ["podman", "--version"],
  installHint: "Install Podman and make sure the rootless runtime is healthy.",
  verifyHint:
    "Verify the Podman runtime is healthy and reachable from this host.",
};

export const CONTAINER_BACKEND_SPECS = [
  DOCKER_BACKEND_SPEC,
  PODMAN_BACKEND_SPEC,
] as const;
