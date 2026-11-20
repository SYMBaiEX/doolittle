import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  installMacOSApp,
  type MacOSInstallOptions,
} from "../../apps/desktop/scripts/install-macos-app";

const roots: string[] = [];
const asarPath = "Contents/Resources/app.asar";
const teamIdentifier = "TEAMID1234";

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.realpathSync(
    fs.mkdtempSync(join(tmpdir(), "doolittle-install-")),
  );
  roots.push(root);
  const source = join(root, "build", "Doolittle.app");
  const destination = join(root, "install", "Doolittle.app");
  for (const [bundle, payload] of [
    [source, "new"],
    [destination, "old"],
  ]) {
    for (const name of [
      asarPath,
      "Contents/Resources/runtime/bin/runtime-manifest.json",
      "Contents/MacOS/Doolittle",
    ]) {
      const path = join(bundle, name);
      fs.mkdirSync(dirname(path), { recursive: true });
      fs.writeFileSync(path, payload);
    }
  }
  const verifyPackage = vi.fn();
  const verifyTrust = vi.fn<NonNullable<MacOSInstallOptions["verifyTrust"]>>();
  const prepareTrust = vi.fn();
  const quiesce = vi.fn();
  const options = {
    fileSystem: fs,
    source,
    destination,
    readMetadata: () => ({
      executable: "Doolittle",
      identifier: "ai.doolittle.desktop",
      shortVersion: "0.1.0",
      version: "0.1.0",
    }),
    verifyPackage,
    verifyTrust,
    prepareTrust,
    quiesce,
  } satisfies MacOSInstallOptions;
  return {
    options,
    installedContents: () =>
      fs.readFileSync(join(destination, asarPath), "utf8"),
  };
}

it("keeps release verification as the default at every install stage", () => {
  const { options, installedContents } = fixture();
  const result = installMacOSApp(options);

  expect(result.trustMode).toBe("release");
  expect(options.verifyTrust.mock.calls.map(([, trust]) => trust)).toEqual([
    "release",
    "release",
    "release",
  ]);
  expect(options.prepareTrust).not.toHaveBeenCalled();
  expect(installedContents()).toBe("new");
});

it("verifies the configured team before replacing any files", () => {
  const { options, installedContents } = fixture();

  options.verifyTrust.mockImplementation((path, trust, team) => {
    expect(path).toBe(options.source);
    expect(trust).toBe("local-signed");
    expect(team).toBe(teamIdentifier);
    throw new Error("TeamIdentifier mismatch");
  });

  expect(() => installMacOSApp({ ...options, teamIdentifier })).toThrow(
    "TeamIdentifier mismatch",
  );
  expect(options.prepareTrust).not.toHaveBeenCalled();
  expect(options.quiesce).not.toHaveBeenCalled();
  expect(installedContents()).toBe("old");
});

it("preserves an already signed source when ad-hoc fallback is allowed", () => {
  const { options, installedContents } = fixture();
  const result = installMacOSApp({
    ...options,
    allowAdHoc: true,
    readSignature: () => ({ kind: "signed", teamIdentifier }),
  });

  expect(result.trustMode).toBe("local-signed");
  expect(
    options.verifyTrust.mock.calls.map(([, trust, team]) => [trust, team]),
  ).toEqual(Array.from({ length: 3 }, () => ["local-signed", teamIdentifier]));
  expect(options.prepareTrust).not.toHaveBeenCalled();
  expect(installedContents()).toBe("new");
});

it.each(["ad-hoc", "unsigned", "signed"] as const)(
  "preserves the installed signed bundle when a %s source would change trust",
  (kind) => {
    const { options, installedContents } = fixture();

    expect(() =>
      installMacOSApp({
        ...options,
        allowAdHoc: true,
        readSignature: (path) => {
          if (path === options.destination)
            return { kind: "signed", teamIdentifier };
          return kind === "signed"
            ? { kind, teamIdentifier: "OTHER12345" }
            : { kind };
        },
      }),
    ).toThrow("cannot replace the signed app");
    expect(options.prepareTrust).not.toHaveBeenCalled();
    expect(options.quiesce).not.toHaveBeenCalled();
    expect(installedContents()).toBe("old");
  },
);

it("limits explicitly allowed ad-hoc signing to the staged bundle", () => {
  const { options, installedContents } = fixture();
  const result = installMacOSApp({
    ...options,
    allowAdHoc: true,
    readSignature: () => ({ kind: "ad-hoc" }),
  });

  expect(result.trustMode).toBe("ad-hoc");
  expect(options.prepareTrust).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/\.Doolittle\.stage-.+\.app$/u),
    "ad-hoc",
  );
  expect(installedContents()).toBe("new");
});

it("rechecks the existing app immediately before promotion", () => {
  const { options, installedContents } = fixture();
  let installedSigned = false;
  options.quiesce.mockImplementation(() => {
    installedSigned = true;
  });

  expect(() =>
    installMacOSApp({
      ...options,
      allowAdHoc: true,
      readSignature: (path) =>
        installedSigned && path === options.destination
          ? { kind: "signed", teamIdentifier }
          : { kind: "ad-hoc" },
    }),
  ).toThrow("cannot replace the signed app");
  expect(installedContents()).toBe("old");
});
