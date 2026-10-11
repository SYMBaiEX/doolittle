import { fstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "@/types";
import { launchCliBackgroundJob } from "./lifecycle";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));
afterEach(() => spawnMock.mockReset());

describe("private background job launch", () => {
  it("shares one verified append descriptor and closes it after launch", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-launch-"));
    let descriptor = -1;
    const unref = vi.fn();
    try {
      spawnMock.mockImplementation((_executable, _args, options) => {
        descriptor = options.stdio[1];
        expect(options.stdio[2]).toBe(descriptor);
        expect(fstatSync(descriptor).isFile()).toBe(true);
        if (process.platform !== "win32")
          expect(fstatSync(descriptor).mode & 0o777).toBe(0o600);
        return { pid: process.pid, unref };
      });
      const job = launchCliBackgroundJob({
        config: { dataDir } as EnvConfig,
        launcherPath: "/operator/launcher",
        prompt: "hello",
      });
      expect(job.status).toBe("running");
      expect(unref).toHaveBeenCalledOnce();
      expect(() => fstatSync(descriptor)).toThrow();
      expect(readFileSync(job.logPath, "utf8")).toBe("");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("closes the descriptor on synchronous spawn failure and can launch again", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-failed-launch-"));
    let descriptor = -1;
    const input = {
      config: { dataDir } as EnvConfig,
      launcherPath: "/operator/launcher",
      prompt: "hello",
    };
    try {
      spawnMock.mockImplementationOnce((_executable, _args, options) => {
        descriptor = options.stdio[1];
        throw new Error("spawn failed");
      });
      expect(() => launchCliBackgroundJob(input)).toThrow("spawn failed");
      expect(() => fstatSync(descriptor)).toThrow();
      spawnMock.mockReturnValue({ pid: process.pid, unref: vi.fn() });
      expect(launchCliBackgroundJob(input).status).toBe("running");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
