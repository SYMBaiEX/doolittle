import { describe, expect, it } from "vitest";
import { handleJobsSubcommand } from "./jobs-command";

describe("handleJobsSubcommand", () => {
  it("reports requested cancellation without presenting it as completed", async () => {
    const lines: string[] = [];
    await handleJobsSubcommand({
      rest: ["cancel", "job-id"],
      deps: {
        loadConfig: () => ({ dataDir: "/tmp/doolittle" }),
        cliJobStatusSummary: () => "",
        getCliJob: () => undefined,
        renderCliJobReplay: () => "",
        attachCliJob: async () => undefined,
        cancelCliJob: () => ({
          kind: "requested",
          job: { id: "job-id", status: "running" } as never,
        }),
        renderCliTurnEvent: () => "",
        entryLogger: { warn: () => undefined },
        printLine: (message) => lines.push(message),
        writeStdout: () => undefined,
        writeStderrLine: () => undefined,
        exit: () => undefined,
      },
    });
    expect(lines).toEqual([
      "Cancellation requested for background job job-id; awaiting child confirmation.",
    ]);
  });
  it("prints the job summary for list", async () => {
    const lines: string[] = [];
    let exitCode: number | undefined;

    await handleJobsSubcommand({
      rest: [],
      deps: {
        loadConfig: () => ({ dataDir: "/tmp/doolittle" }),
        cliJobStatusSummary: (dataDir) => `summary:${dataDir}`,
        getCliJob: () => undefined,
        renderCliJobReplay: () => "",
        attachCliJob: async () => undefined,
        cancelCliJob: () => ({ kind: "not-found", id: "missing" }),
        renderCliTurnEvent: () => "event",
        entryLogger: {
          warn: () => undefined,
        },
        printLine: (message) => {
          lines.push(message);
        },
        writeStdout: (message) => {
          lines.push(`stdout:${message}`);
        },
        writeStderrLine: (message) => {
          lines.push(`stderr:${message}`);
        },
        exit: (code) => {
          exitCode = code;
        },
      },
    });

    expect(lines).toEqual(["summary:/tmp/doolittle"]);
    expect(exitCode).toBeUndefined();
  });

  it("shows usage and exits when show is missing a job id", async () => {
    const lines: string[] = [];
    let exitCode: number | undefined;

    await handleJobsSubcommand({
      rest: ["show"],
      deps: {
        loadConfig: () => ({ dataDir: "/tmp/doolittle" }),
        cliJobStatusSummary: () => "",
        getCliJob: () => undefined,
        renderCliJobReplay: () => "",
        attachCliJob: async () => undefined,
        cancelCliJob: () => ({ kind: "not-found", id: "missing" }),
        renderCliTurnEvent: () => "event",
        entryLogger: {
          warn: () => undefined,
        },
        printLine: (message) => {
          lines.push(message);
        },
        writeStdout: (message) => {
          lines.push(`stdout:${message}`);
        },
        writeStderrLine: (message) => {
          lines.push(`stderr:${message}`);
        },
        exit: (code) => {
          exitCode = code;
        },
      },
    });

    expect(lines).toEqual(["stderr:Usage: doolittle jobs show <job-id>"]);
    expect(exitCode).toBe(1);
  });
});
