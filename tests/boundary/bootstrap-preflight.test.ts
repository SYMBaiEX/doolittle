import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLinkedProviderAccountsSnapshot } from "@doolittle/agent/runtime/native/account-auth";
import { expect, it, vi } from "vitest";
import { getDependencyProbes } from "../../scripts/bootstrap/wizard/dependencies";

it("finds executable tools on PATH and at a configured browser path", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-preflight-"));
  try {
    vi.stubEnv("PATH", root);
    vi.stubEnv("PATHEXT", ".CMD;.EXE");

    const suffix = process.platform === "win32" ? ".CMD" : "";
    const browser = join(root, `custom browser${suffix}`);
    writeFileSync(join(root, `git${suffix}`), "", { mode: 0o700 });
    writeFileSync(browser, "", { mode: 0o700 });
    mkdirSync(join(root, `docker${suffix}`));

    const probes = getDependencyProbes(
      root,
      new Map([["DOOLITTLE_BROWSER_COMMAND", browser]]),
      getLinkedProviderAccountsSnapshot(undefined, []),
    );
    const installed = new Map(
      probes.map(({ key, installed }) => [key, installed]),
    );
    expect(installed.get("git")).toBe(true);
    expect(installed.get("lightpanda")).toBe(true);
    expect(installed.get("docker")).toBe(false);
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});
