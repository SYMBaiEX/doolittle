import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
if (process.platform !== "darwin") {
  throw new Error("The GPUI application bundle target requires macOS.");
}

const product = "Doolittle Native";
const manifest = JSON.parse(
  readFileSync(join(repo, "package.json"), "utf8"),
) as {
  version: string;
};
if (!/^\d+\.\d+\.\d+$/u.test(manifest.version)) {
  throw new Error("The app bundle requires a numeric product version.");
}

const node = realpathSync(process.execPath);
const nodeLicense = resolve(dirname(node), "../LICENSE");
if (!existsSync(nodeLicense)) {
  throw new Error(
    "Use the repository-pinned Node distribution with its included LICENSE.",
  );
}

function run(command: string, args: string[], cwd = repo): void {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

run("cargo", ["build", "--locked", "--release", "-p", "doolittle-desktop"]);
const desktop = join(repo, "apps/desktop");
const prepared = join(repo, "target/native-runtime");
run("nub", ["scripts/prepare-runtime.ts", "--standalone-node"], desktop);
run(
  "nub",
  [
    "scripts/verify-package.ts",
    "--runtime-manifest",
    join(prepared, "runtime-manifest.json"),
  ],
  desktop,
);

const cargoTarget = resolve(repo, process.env.CARGO_TARGET_DIR || "target");
const packages = join(cargoTarget, "native-packages");
mkdirSync(packages, { recursive: true });
const output = mkdtempSync(join(packages, "mac-"));
const artifact = join(output, `${product}.app`);
try {
  const contents = join(artifact, "Contents");
  const binaries = join(contents, "MacOS");
  const resources = join(contents, "Resources");
  const runtime = join(resources, "runtime");
  mkdirSync(binaries, { recursive: true });
  mkdirSync(resources, { recursive: true });

  copyFileSync(
    join(cargoTarget, "release", "doolittle-desktop"),
    join(binaries, "Doolittle"),
  );
  copyFileSync(
    join(repo, "apps/desktop/assets/icon.icns"),
    join(resources, "Doolittle.icns"),
  );
  copyFileSync(join(repo, "LICENSE"), join(resources, "LICENSE"));
  mkdirSync(join(resources, "licenses"));
  copyFileSync(
    join(repo, "apps/desktop-native/assets/Bangers-OFL.txt"),
    join(resources, "licenses/Bangers-OFL.txt"),
  );

  cpSync(prepared, runtime, { recursive: true, verbatimSymlinks: true });
  mkdirSync(join(runtime, "bin"), { recursive: true });
  copyFileSync(node, join(runtime, "bin/node"));
  copyFileSync(nodeLicense, join(runtime, "bin/LICENSE.node"));
  cpSync(join(repo, "packages/skills"), join(runtime, "packages/skills"), {
    recursive: true,
    filter: (path) =>
      !path.includes("/node_modules") && !path.includes("/.git"),
  });

  writeFileSync(
    join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${product}</string>
  <key>CFBundleDisplayName</key><string>${product}</string>
  <key>CFBundleIdentifier</key><string>org.doolittle.native</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Doolittle</string>
  <key>CFBundleIconFile</key><string>Doolittle.icns</string>
  <key>CFBundleShortVersionString</key><string>${manifest.version}</string>
  <key>CFBundleVersion</key><string>${manifest.version}</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`,
  );

  run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", artifact]);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", artifact]);
  console.log(`Native macOS bundle ready at ${artifact}`);
} catch (error) {
  rmSync(output, { recursive: true, force: true });
  throw error;
}
