import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  cargoTarget,
  desktop,
  prepareNativeRuntime,
  productVersion,
  repo,
  run,
} from "./native-package-runtime";
import {
  notarizeRelease,
  releaseBundleId,
  releaseConfig,
  releasePlist,
  signReleaseBundle,
} from "./package-native-macos-release";

if (process.platform !== "darwin") {
  throw new Error("The GPUI application bundle target requires macOS.");
}

const args = process.argv.slice(process.argv[2] === "--" ? 3 : 2);
if (
  args.length > 1 ||
  (args.length === 1 && !["--release", "--smoke"].includes(args[0]))
) {
  throw new Error("Usage: nub run native:package:mac [--release | --smoke]");
}
const release =
  args[0] === "--release" ? releaseConfig(process.env) : undefined;
const product = release ? "Doolittle" : "Doolittle Native";
const bundleId = release ? releaseBundleId : "org.doolittle.native";
const version = productVersion();
const installRuntime = prepareNativeRuntime(Boolean(release));

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
    join(cargoTarget, "release", "doolittle-native"),
    join(binaries, "doolittle-native"),
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

  installRuntime(runtime);

  writeFileSync(
    join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${product}</string>
  <key>CFBundleDisplayName</key><string>${product}</string>
  <key>CFBundleIdentifier</key><string>${bundleId}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Doolittle</string>
  <key>CFBundleIconFile</key><string>Doolittle.icns</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>${release ? releasePlist(release) : ""}
</dict>
</plist>
`,
  );

  if (release) {
    signReleaseBundle(
      release,
      artifact,
      join(desktop, "entitlements.mac.plist"),
    );
    run(
      "nub",
      ["scripts/verify-package.ts", "--verify-signature", artifact],
      desktop,
    );
    const archive = join(
      output,
      `Doolittle-mac-${process.arch}-${version}.zip`,
    );
    notarizeRelease(release, artifact, archive);
    console.log(`Native macOS release archive ready at ${archive}`);
  } else {
    run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", artifact]);
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", artifact]);
  }
  if (args[0] === "--smoke") {
    run("python3", ["tests/native/packaged-macos.py", artifact]);
  }
  console.log(`Native macOS bundle ready at ${artifact}`);
} catch (error) {
  rmSync(output, { recursive: true, force: true });
  throw error;
}
