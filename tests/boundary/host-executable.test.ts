import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

function probeBootAuthority(
  pathAuthority: string,
  command: string,
): { resolved: string | null; routed: string } {
  const script = `
    await import(${JSON.stringify(pathToFileURL(resolve("apps/cli/src/entrypoint/host-execution.ts")).href)});
    const helper = await import(${JSON.stringify(pathToFileURL(resolve("packages/agent/src/services/host-executable.ts")).href)});
    const resolved = helper.resolveHostExecutableWithinBootAuthority(process.env.FIXTURE_COMMAND);
    console.log(JSON.stringify({
      resolved: resolved ?? null,
      routed: helper.hostExecutableForRouter(process.env.FIXTURE_COMMAND),
    }));
  `;
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 10_000,
      env: {
        PATH: pathAuthority,
        FIXTURE_COMMAND: command,
      },
    },
  );
  return JSON.parse(output) as { resolved: string | null; routed: string };
}

it.skipIf(process.platform === "win32")(
  "maps merged-/usr executable aliases back into boot PATH authority",
  () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-host-alias-"));
    try {
      const usrBin = join(root, "usr", "bin");
      const bin = join(root, "bin");
      mkdirSync(usrBin, { recursive: true });
      symlinkSync("usr/bin", bin);
      writeFileSync(join(usrBin, "sh"), "#!/bin/sh\nexit 0\n", {
        mode: 0o755,
      });

      expect(probeBootAuthority(usrBin, join(bin, "sh"))).toEqual({
        resolved: join(usrBin, "sh"),
        routed: join(usrBin, "sh"),
      });
      expect(probeBootAuthority(bin, join(usrBin, "sh"))).toEqual({
        resolved: join(bin, "sh"),
        routed: join(bin, "sh"),
      });
      expect(probeBootAuthority(usrBin, join(root, "outside", "sh"))).toEqual({
        resolved: null,
        routed: join(root, "outside", "sh"),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
