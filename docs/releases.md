# Releases

Release preparation starts from a committed, clean checkout with the locked
SDK and dependency graph installed. Versioned release notes belong in the root
[`CHANGELOG.md`](../CHANGELOG.md); keep this guide focused on the process.

## Prepare source

Keep every `@doolittle/*` workspace version aligned with the root product version.
The root `elizaSdk` contract defines the independent upstream source baseline
and published-package exceptions; SDK versions need not match the product version.
Update manifests and the lockfile together, then install the frozen graph:

```sh
nub run deps:install -- --frozen-lockfile --ignore-scripts
nub run desktop:runtime:install
nubx playwright install chromium
```

Record user-visible changes, compatibility requirements, and known limits in
the changelog. Check platform prerequisites before building installers.

## Verify

```sh
nub run check:release
```

The complete gate runs builds, dependency and security checks, SDK integrity,
desktop runtime preparation and audit, and real runtime, Electron, and packaged
acceptance. Its package stages require clean HEAD. Run the optional
`nub run check:release:static` for build and policy feedback before the full gate.

A green local gate establishes only the coverage it ran. Track separate evidence
for native installation, update behavior, signatures, notarization, and any live
provider validation required by the release.

## Build artifacts

Build the GPUI desktop and Rust CLI on the matching target host.

```sh
nub run desktop:package:mac
nub run desktop:package:linux
nub run desktop:package:win
```

Native artifacts are written to `target/native-packages`. Each contains the
desktop, CLI, bundled Node, and verified ElizaOS runtime. Linux and Windows use
portable archives. macOS uses an ad-hoc app for local use and an optional
Developer ID and notarized ZIP for distribution. See the
[native macOS signing and update process](native-macos-release.md).

### Electron compatibility artifacts

```sh
nub run legacy:desktop:package:dir
nub run --cwd apps/desktop package:mac
nub run legacy:desktop:package:win
nub run --cwd apps/desktop package:linux
```

Outputs go to `apps/desktop/release`. The desktop packages contain their runtime;
end users do not need the source checkout, Nub, or a separate Node installation.

| Target  | Artifacts            | Additional requirements                                                                        |
| ------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| macOS   | DMG and ZIP          | macOS signing tools; release distribution needs Developer ID signing and notarization.         |
| Windows | x64 NSIS installer   | Windows signing credentials and the exact Authenticode publisher identity for trusted updates. |
| Linux   | x64 AppImage and DEB | Target-compatible native dependencies and package tooling.                                     |

The packaging wrappers require a clean commit before compiling and prepare the
renderer, runtime dependencies, and legal notices in one command. They verify
source identity again before promoting output. Native packaging also produces a
provenance receipt and SBOM. The wrappers disable electron-builder publication.
Inspect [`apps/desktop/package.json`](../apps/desktop/package.json) and
[`package.ts`](../apps/desktop/scripts/package.ts) for current options.

`nub run legacy:desktop:package:all` is the local Electron cross-package helper for
Apple Silicon macOS with Wine. It installs the frozen dependency graph with the
checked ElizaOS archives, verifies the required target-native packages, and
builds the matrix transactionally. Its `unpacked-manifest.json` records local
build outputs. Native installation and update verification still requires each
target platform.

## Verify a package

```sh
nub run desktop:runtime:audit
nub run test:e2e:desktop-packaged
```

The packaged test runner checks the repository artifact against clean HEAD and
its `app.asar` hash. Verify an extracted or installed package against the source
platform receipt by pointing the verifier at its `resources/runtime` directory.
That also checks the adjacent `app.asar` and desktop artifact manifest.

```sh
nub apps/desktop/scripts/package-provenance.ts --verify-runtime-tree --release-directory apps/desktop/release --platform macos --runtime-directory /path/to/Doolittle.app/Contents/Resources/runtime
```

Use the target platform's native tools to verify release signatures,
installation, launch, and update metadata as separate steps.

### Install an Electron compatibility bundle on macOS

`nub run legacy:desktop:install:mac` installs a release bundle after verifying the
Doolittle signing team, nested runtime signatures, notarization, and Gatekeeper.
Use `--source /path/to/Doolittle.app` to select an unpacked bundle.

For a local signed build, use an existing Developer ID Application identity.
Replace the placeholders with the certificate SHA-1 and the ten-character
Apple Team ID. Run from a clean checkout.

```sh
CSC_NAME="CERTIFICATE_SHA1" nub run --cwd apps/desktop package:dir -- --config.forceCodeSigning=true
nub run legacy:desktop:install:mac -- --team-id TEAMID1234
```

The installer preserves the bundle's signature and verifies the Apple signing
requirement for the chosen team and Doolittle bundle identifier. Reuse the same
signing identity and team across local updates for consistent login Keychain
access. This mode verifies local code signing. Release installs also require
notarization and Gatekeeper assessment.

`nub run legacy:desktop:install:mac:ad-hoc` is the development fallback when
a certificate is unavailable. It preserves a signed source, and refuses to
replace a signed app with an ad-hoc build or an app signed by another team.
Use `--destination /path/to/Doolittle.app` for a separate development copy.

## Assemble and publish

[`scripts/create-desktop-release.ts`](../scripts/create-desktop-release.ts)
validates the collected native receipts, expected artifact set, hashes, source
commit, and SBOMs before producing the release manifest and checksum file.
The checked release configuration uses the changelog for the published notes.

Building or assembling artifacts does not publish them. Publish only the
verified target set for the intended tag and commit, and verify the resulting
release assets independently. Keep signing material and credentials out of
artifacts, receipts, documentation, and source control.

Provider packages use a separate publishing contract:

```sh
nub run publish:providers:check
nub run publish:providers -- --provider all
```

These run the local provider preflight/dry-run path. Live provider publication
requires the verified provider tag and trusted publication environment enforced
by [`publish-provider-packages.ts`](../scripts/publish-provider-packages.ts).
