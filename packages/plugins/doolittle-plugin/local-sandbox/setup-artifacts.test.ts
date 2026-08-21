import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sandboxDockerfile = readFileSync(
  new URL("../../../../scripts/docker/sandbox/Dockerfile", import.meta.url),
  "utf8",
);
const setupScript = readFileSync(
  new URL("../../../../scripts/sandbox-setup.sh", import.meta.url),
  "utf8",
);

describe("local sandbox setup artifacts", () => {
  it("provides the official SandboxManager image contract", () => {
    expect(sandboxDockerfile).toContain(
      "FROM node:26.5.0-bookworm-slim@sha256:2d49d876e96237d76de412761cf05dbfe5aee325cc4406a4d41d5824c5bb8beb",
    );
    expect(sandboxDockerfile).toContain("python3");
    expect(sandboxDockerfile).toContain("@nubjs/nub@0.7.5");
    expect(sandboxDockerfile).toContain("WORKDIR /workspace");
    expect(sandboxDockerfile).toContain("USER 1000:1000");
    expect(sandboxDockerfile).toContain('CMD ["sleep", "infinity"]');
  });

  it("builds the image in the engine store selected by official auto-detection", () => {
    expect(setupScript).toContain('IMAGE="eliza-sandbox:bookworm-slim"');
    expect(setupScript).toContain(
      'container build -t "$IMAGE" -f "$DOCKERFILE" .',
    );
    expect(setupScript).toContain(
      'docker build -t "$IMAGE" -f "$DOCKERFILE" .',
    );
    expect(setupScript).toContain("docker info >/dev/null 2>&1");
  });
});
