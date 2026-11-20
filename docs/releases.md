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
nub run check:release:static
nub run check:release
```

The static gate includes builds, dependency/security checks, SDK integrity,
and desktop runtime preparation/audit. The complete gate adds real runtime,
Electron, and packaged acceptance. Its package stages require clean HEAD;
commit any source changes before running them.

A green local gate establishes only the coverage it ran. Track separate evidence
for native installation, update behavior, signatures, notarization, and any live
provider validation required by the release.

## Build artifacts

```sh
nub run desktop:package:dir
nub run desktop:package:mac
nub run desktop:package:win
nub run desktop:package:linux
```

Outputs go to `apps/desktop/release`. The desktop packages contain their runtime;
end users do not need the source checkout, Nub, or a separate Node installation.

| Target  | Artifacts            | Additional requirements                                                                        |
| ------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| macOS   | DMG and ZIP          | macOS signing tools; release distribution needs Developer ID signing and notarization.         |
| Windows | x64 NSIS installer   | Windows signing credentials and the exact Authenticode publisher identity for trusted updates. |
| Linux   | x64 AppImage and DEB | Target-compatible native dependencies and package tooling.                                     |

The packaging wrappers validate source identity and preserve release provenance.
They prepare runtime dependencies, legal notices, artifact inventories, and
SBOMs; do not bypass them with an unverified direct builder invocation.
Inspect [`apps/desktop/package.json`](../apps/desktop/package.json) and
[`package.ts`](../apps/desktop/scripts/package.ts) for current options.

`nub run desktop:package:all` is the supported local cross-package helper for
Apple Silicon macOS with Wine. It verifies required target-native packages and
builds the release matrix transactionally. It does not replace native testing
on Windows and Linux.

## Verify a package

```sh
nub run desktop:runtime:audit
nub run test:e2e:desktop-packaged
```

The packaged test runner checks the repository artifact against clean HEAD and
its `app.asar` hash. Use the target platform's native tools to verify release
signatures, installation, launch, and update metadata as separate steps.

### Install on macOS

`nub run desktop:install:mac` installs a release bundle after verifying the
Doolittle signing team, nested runtime signatures, notarization, and Gatekeeper.
Use `--source /path/to/Doolittle.app` to select an unpacked bundle.

For a local signed build, use an existing Developer ID Application identity.
Replace the placeholders with the certificate SHA-1 and the ten-character
Apple Team ID. Run from a clean checkout.

```sh
CSC_NAME="CERTIFICATE_SHA1" nub run --cwd apps/desktop package:dir -- --config.forceCodeSigning=true
nub run desktop:install:mac -- --team-id TEAMID1234
```

The installer preserves the bundle's signature and verifies the Apple signing
requirement for the chosen team and Doolittle bundle identifier. Reuse the same
signing identity and team across local updates for consistent login Keychain
access. This mode verifies local code signing. Release installs also require
notarization and Gatekeeper assessment.

`nub run desktop:install:mac:ad-hoc` is the explicit development fallback when
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
