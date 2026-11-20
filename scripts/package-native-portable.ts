import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
if (
  (platform !== "linux" && platform !== "win32") ||
  target.length > 1 ||
  (target.length === 1 && target[0] !== platform)
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
  installRuntime(join(staging, "runtime"));
  const archive = join(output, `${product}.${windows ? "zip" : "tar.gz"}`);
  run("tar", [windows ? "-acf" : "-czf", archive, product], output);
  rmSync(staging, { recursive: true });
  console.log(`Native desktop and CLI archive ready at ${archive}`);
} catch (error) {
  rmSync(output, { recursive: true, force: true });
  throw error;
}
