import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cargoTarget,
  prepareNativeRuntime,
  productVersion,
  repo,
  run,
} from "./native-package-runtime";

const platform = process.platform;
const target = process.argv.slice(process.argv[2] === "--" ? 3 : 2);
const smoke = target[0] === "--smoke";
if (
  (platform !== "linux" && platform !== "win32") ||
  target.length > 1 ||
  (target.length === 1 && target[0] !== platform && !smoke)
) {
  throw new Error(
    "Build the portable package on the destination Linux or Windows host.",
  );
}
const windows = platform === "win32";
const version = productVersion();
const installRuntime = prepareNativeRuntime();
const packages = join(cargoTarget, "native-packages");
mkdirSync(packages, { recursive: true });
const output = mkdtempSync(join(packages, `${platform}-`));
const product = `Doolittle-${platform}-${process.arch}-${version}`;
const staging = join(output, product);
try {
  mkdirSync(staging);
  const exe = windows ? ".exe" : "";
  copyFileSync(
    join(cargoTarget, "release", `doolittle-desktop${exe}`),
    join(staging, `doolittle-desktop${exe}`),
  );
  copyFileSync(
    join(cargoTarget, "release", `doolittle-native${exe}`),
    join(staging, `doolittle${exe}`),
  );
  copyFileSync(join(repo, "LICENSE"), join(staging, "LICENSE"));
  copyFileSync(
    join(repo, "apps/desktop-native/assets/Bangers-OFL.txt"),
    join(staging, "Bangers-OFL.txt"),
  );
  copyFileSync(
    join(repo, "apps/desktop-native/assets/GPUI-Component-Assets-NOTICE.txt"),
    join(staging, "GPUI-Component-Assets-NOTICE.txt"),
  );
  installRuntime(join(staging, "runtime"));
  const archive = join(output, `${product}.${windows ? "zip" : "tar.gz"}`);
  run("tar", [windows ? "-acf" : "-czf", archive, product], output);
  rmSync(staging, { recursive: true });
  if (smoke) {
    run("tar", ["-xf", archive, "-C", output], output);
    verifyPackagedClients(staging, exe);
    rmSync(staging, { recursive: true });
  }
  console.log(`Native desktop and CLI archive ready at ${archive}`);
} catch (error) {
  rmSync(output, { recursive: true, force: true });
  throw error;
}

function verifyPackagedClients(staging: string, exe: string): void {
  const scratch = mkdtempSync(join(tmpdir(), "doolittle-portable-smoke-"));
  try {
    const workspace = join(scratch, "workspace");
    const profile = join(scratch, "profile");
    for (const path of [workspace, profile]) mkdirSync(path, { mode: 0o700 });
    writeFileSync(
      join(profile, "settings.json"),
      JSON.stringify({ model: { provider: "offline", model: "offline-test" } }),
    );
    const options = {
      cwd: workspace,
      timeout: 45_000,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        HOME: scratch,
        USERPROFILE: scratch,
        APPDATA: scratch,
        LOCALAPPDATA: scratch,
        XDG_DATA_HOME: scratch,
        TMPDIR: scratch,
        TEMP: scratch,
        TMP: scratch,
      },
    };
    execFileSync(join(staging, `doolittle-desktop${exe}`), ["--help"], options);
    const result = execFileSync(
      join(staging, `doolittle${exe}`),
      [
        "--workspace",
        workspace,
        "--profile",
        profile,
        "--offline",
        "native",
        "probe",
        "--json",
      ],
      options,
    );
    if (typeof JSON.parse(result.toString("utf8"))?.status !== "string") {
      throw new Error("The packaged ElizaOS runtime did not report health.");
    }
    console.log("Extracted native desktop and CLI passed startup checks.");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
