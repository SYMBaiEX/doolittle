import { describe, expect, it } from "bun:test";
import { handleJobsSubcommand } from "./jobs-command";

describe("handleJobsSubcommand", () => {
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
        cancelCliJob: () => undefined,
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
        cancelCliJob: () => undefined,
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
