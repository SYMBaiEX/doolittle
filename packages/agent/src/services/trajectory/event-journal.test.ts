import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeTrajectoryEventRecord,
  redactTrajectoryText,
} from "./event-journal";

const ENV_KEY = "DOOLITTLE_TRAJECTORY_TEST_API_KEY";
const originalEnvValue = process.env[ENV_KEY];

afterEach(() => {
  if (originalEnvValue === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnvValue;
});

describe("trajectory event journal redaction", () => {
  it("redacts credential assignments, authorization headers, and bearer tokens", () => {
    const value = [
      "OPENAI_API_KEY=sk-local-value",
      '"password": "correct horse battery staple"',
      "Authorization: Bearer auth-token-value",
      "curl -H 'X-Test: Bearer standalone-token-value'",
    ].join("\n");

    const redacted = redactTrajectoryText(value);

    expect(redacted).toContain("OPENAI_API_KEY=[redacted]");
    expect(redacted).toContain('"password": [redacted]');
    expect(redacted).toContain("Authorization: [redacted]");
    expect(redacted).toContain("Bearer [redacted]");
    expect(redacted).not.toContain("sk-local-value");
    expect(redacted).not.toContain("correct horse battery staple");
    expect(redacted).not.toContain("auth-token-value");
    expect(redacted).not.toContain("standalone-token-value");
  });

  it("redacts sensitive environment values anywhere in event text and metadata", () => {
    process.env[ENV_KEY] = "environment-secret-value";

    const record = normalizeTrajectoryEventRecord({
      category: "action",
      event: "action.completed",
      text: "tool returned environment-secret-value",
      metadata: {
        apiKey: "direct-secret-value",
        actionResult: {
          data: {
            stdout: "result=environment-secret-value",
            stderr: "refresh_token=refresh-secret-value",
          },
        },
      },
    });
    const serialized = JSON.stringify(record);

    expect(record.text).toBe("tool returned [redacted]");
    expect(record.metadata?.apiKey).toBe("[redacted]");
    expect(serialized).not.toContain("environment-secret-value");
    expect(serialized).not.toContain("direct-secret-value");
    expect(serialized).not.toContain("refresh-secret-value");
  });

  it("preserves ordinary diagnostic output", () => {
    expect(
      redactTrajectoryText(
        "Command completed\nexitCode=0\nstdout=installed 12 packages",
      ),
    ).toBe("Command completed\nexitCode=0\nstdout=installed 12 packages");
  });
});
