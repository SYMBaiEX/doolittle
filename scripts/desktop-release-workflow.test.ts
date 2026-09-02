import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findMutableWorkflowActions } from "./check-workflow-security";

const producers = [
  ".github/workflows/desktop-macos.yml",
  ".github/workflows/desktop-windows.yml",
  ".github/workflows/desktop-linux.yml",
];

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function mappingKeys(source: string, indentation: number): string[] {
  const prefix = " ".repeat(indentation);
  return source.split("\n").flatMap((line) => {
    if (!line.startsWith(prefix) || line.startsWith(`${prefix} `)) return [];
    const match = line.slice(indentation).match(/^([A-Z][A-Z0-9_]*):/u);
    return match?.[1] ? [match[1]] : [];
  });
}

describe("atomic desktop release workflow", () => {
  it.each(producers)("keeps %s reusable, manual, and read-only", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("workflow_call:");
    expect(source).toContain("workflow_dispatch:");
    expect(source).toContain("permissions:\n  contents: read");
    expect(findMutableWorkflowActions(source, path)).toEqual([]);
    expect(source).not.toContain("softprops/action-gh-release");
    expect(source).not.toMatch(/\n\s+push:\s*\n/u);
  });

  it("publishes once only after every native producer and validation", () => {
    const source = readFileSync(
      ".github/workflows/desktop-release.yml",
      "utf8",
    );
    const mac = readFileSync(producers[0] ?? "", "utf8");
    const windows = readFileSync(producers[1] ?? "", "utf8");
    const linux = readFileSync(producers[2] ?? "", "utf8");
    const macCaller = section(source, "\n  macos:\n", "\n  windows:\n");
    const windowsCaller = section(source, "\n  windows:\n", "\n  linux:\n");
    const linuxCaller = section(source, "\n  linux:\n", "\n  assemble:\n");
    const macWorkflowCall = section(
      mac,
      "  workflow_call:\n",
      "  workflow_dispatch:\n",
    );
    const windowsWorkflowCall = section(
      windows,
      "  workflow_call:\n",
      "  workflow_dispatch:\n",
    );
    expect(source).toContain('      - "v*"');
    expect(source).toContain("uses: ./.github/workflows/desktop-macos.yml");
    expect(source).toContain("uses: ./.github/workflows/desktop-windows.yml");
    expect(macCaller).toContain("release_tag: $" + "{{ github.ref_name }}");
    expect(windowsCaller).toContain("release_tag: $" + "{{ github.ref_name }}");
    expect(windowsCaller).toContain(
      "windows_publisher_name: $" + "{{ vars.WIN_PUBLISHER_NAME }}",
    );
    expect(source).toContain("uses: ./.github/workflows/desktop-linux.yml");
    expect(source).not.toContain("secrets: inherit");
    expect(mappingKeys(macCaller, 6)).toEqual([
      "MAC_CSC_LINK",
      "MAC_CSC_KEY_PASSWORD",
      "APPLE_ID",
      "APPLE_APP_SPECIFIC_PASSWORD",
      "APPLE_TEAM_ID",
    ]);
    expect(mappingKeys(windowsCaller, 6)).toEqual([
      "WIN_CSC_LINK",
      "WIN_CSC_KEY_PASSWORD",
    ]);
    expect(mappingKeys(linuxCaller, 6)).toEqual([]);
    expect(mappingKeys(macWorkflowCall, 6)).toEqual([
      "MAC_CSC_LINK",
      "MAC_CSC_KEY_PASSWORD",
      "APPLE_ID",
      "APPLE_APP_SPECIFIC_PASSWORD",
      "APPLE_TEAM_ID",
    ]);
    expect(mappingKeys(windowsWorkflowCall, 6)).toEqual([
      "WIN_CSC_LINK",
      "WIN_CSC_KEY_PASSWORD",
    ]);
    expect(source).toMatch(
      /macos:[\s\S]*?secrets:\n\s+MAC_CSC_LINK: \$\{\{ secrets\.MAC_CSC_LINK \}\}\n\s+MAC_CSC_KEY_PASSWORD: \$\{\{ secrets\.MAC_CSC_KEY_PASSWORD \}\}\n\s+APPLE_ID: \$\{\{ secrets\.APPLE_ID \}\}\n\s+APPLE_APP_SPECIFIC_PASSWORD: \$\{\{ secrets\.APPLE_APP_SPECIFIC_PASSWORD \}\}\n\s+APPLE_TEAM_ID: \$\{\{ secrets\.APPLE_TEAM_ID \}\}/u,
    );
    expect(source).toMatch(
      /windows:[\s\S]*?secrets:\n\s+WIN_CSC_LINK: \$\{\{ secrets\.WIN_CSC_LINK \}\}\n\s+WIN_CSC_KEY_PASSWORD: \$\{\{ secrets\.WIN_CSC_KEY_PASSWORD \}\}/u,
    );
    expect(source).toMatch(
      /linux:\n\s+needs: preflight\n\s+uses: \.\/\.github\/workflows\/desktop-linux\.yml\n\n\s+assemble:/u,
    );
    expect(mac).toContain(`workflow_call:
    inputs:
      release_tag:
        description: Exact existing v-prefixed release tag to build
        required: true
        type: string
    secrets:
      MAC_CSC_LINK:
        required: true
      MAC_CSC_KEY_PASSWORD:
        required: true
      APPLE_ID:
        required: true
      APPLE_APP_SPECIFIC_PASSWORD:
        required: true
      APPLE_TEAM_ID:
        required: true
  workflow_dispatch:`);
    expect(windows).toContain(`workflow_call:
    inputs:
      release_tag:
        description: Exact existing v-prefixed release tag to build
        required: true
        type: string
      windows_publisher_name:
        description: Full Authenticode signer subject DN used by electron-updater
        required: false
        type: string
    secrets:
      WIN_CSC_LINK:
        required: true
      WIN_CSC_KEY_PASSWORD:
        required: true
  workflow_dispatch:`);
    expect(windows).toContain(
      "nub apps/desktop/scripts/verify-windows-update-manifest.ts",
    );
    expect(windows).toContain("--expected-publisher $env:WIN_PUBLISHER_NAME");
    expect(linux).toContain("workflow_call:\n  workflow_dispatch:");
    expect(linux).not.toContain("secrets:");
    expect(source.match(/needs: preflight/gu)).toHaveLength(3);
    expect(source).toContain("nub audit --production --audit-level critical");
    expect(source).not.toContain("nub audit --production --audit-level high");
    expect(source).toContain("nub run check:runtime-advisory-policy");
    expect(mac).toContain("nub apps/desktop/scripts/verify-package.ts");
    expect(linux).toContain("nub apps/desktop/scripts/verify-package.ts");
    expect(windows).toContain("nub run desktop:package:win");
    expect(linux).toContain(
      "--runtime-directory linux-unpacked/resources/runtime",
    );
    expect(linux).not.toContain(
      "--runtime-directory apps/desktop/release/linux-unpacked",
    );
    expect(windows).toContain(
      "--runtime-directory win-unpacked/resources/runtime",
    );
    expect(windows).not.toContain(
      "--runtime-directory apps/desktop/release/win-unpacked",
    );
    expect(source).toContain(
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
    );
    expect(source).toContain("needs: [macos, windows, linux]");
    expect(source).toContain("nub scripts/create-desktop-release.ts");
    expect(source).toContain("Attest validated binary and SBOM assets");
    expect(source).toContain(
      "actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4.2.1",
    );
    expect(source).toMatch(
      /assemble:[\s\S]*?permissions:\n\s+contents: read\n\s+id-token: write\n\s+attestations: write/u,
    );
    const attestation = section(
      source,
      "      - name: Attest validated binary and SBOM assets",
      "      - name: Upload validated release bundle",
    );
    expect(attestation).toContain("release/Doolittle-*-mac-arm64.dmg");
    expect(attestation).toContain("release/Doolittle-*-mac-arm64.zip");
    expect(attestation).toContain("release/Doolittle-*-win-x64.exe");
    expect(attestation).toContain("release/Doolittle-*-linux-x64.AppImage");
    expect(attestation).toContain("release/Doolittle-*-linux-x64.deb");
    expect(attestation).toContain("release/doolittle-desktop-macos.spdx.json");
    expect(attestation).toContain(
      "release/doolittle-desktop-windows.spdx.json",
    );
    expect(attestation).toContain("release/doolittle-desktop-linux.spdx.json");
    expect(
      source.indexOf("nub scripts/create-desktop-release.ts"),
    ).toBeLessThan(source.indexOf("Attest validated binary and SBOM assets"));
    expect(
      source.indexOf("Attest validated binary and SBOM assets"),
    ).toBeLessThan(source.indexOf("Upload validated release bundle"));
    expect(source).toContain("needs: assemble");
    expect(source.match(/softprops\/action-gh-release/gu)).toHaveLength(1);
    expect(source.match(/contents: write/gu)).toHaveLength(1);
    expect(
      findMutableWorkflowActions(
        source,
        ".github/workflows/desktop-release.yml",
      ),
    ).toEqual([]);
    expect(source).toContain(
      "body_path: docs/releases/v$" + "{{ needs.assemble.outputs.version }}.md",
    );
    expect(source).toMatch(
      /publish:[\s\S]*?permissions:\n\s+contents: write[\s\S]*?softprops\/action-gh-release/u,
    );
  });

  it("gates native signing on approval and an exact release tag", () => {
    const mac = readFileSync(producers[0] ?? "", "utf8");
    const windows = readFileSync(producers[1] ?? "", "utf8");

    for (const workflow of [mac, windows]) {
      expect(workflow).toContain("environment: release");
      expect(workflow.match(/release_tag:/gu)).toHaveLength(2);
      expect(workflow).toContain(
        "description: Exact existing v-prefixed release tag; select the same tag as the workflow ref",
      );
      expect(workflow).toMatch(
        /workflow_dispatch:[\s\S]*?release_tag:[\s\S]*?required: true[\s\S]*?type: string/u,
      );
      expect(workflow).toContain(
        "ref: refs/tags/$" + "{{ inputs.release_tag }}",
      );
      expect(workflow).toContain("fetch-depth: 0");
      expect(workflow).toContain("Bind build to exact release tag");
      expect(workflow).toContain("git show-ref --verify --quiet");
      expect(workflow).toContain("git rev-parse --verify");
      expect(workflow).toContain("^{}");
      expect(workflow).toContain("GITHUB_REF");
      expect(workflow).toContain("GITHUB_SHA");
      expect(workflow).toContain("origin/main");
      expect(workflow.indexOf("Bind build to exact release tag")).toBeLessThan(
        workflow.indexOf("Require signing"),
      );
      expect(workflow.indexOf("Bind build to exact release tag")).toBeLessThan(
        workflow.indexOf("${{ secrets."),
      );
    }

    expect(mac).toContain('test "$GITHUB_REF" = "$tag_ref"');
    expect(mac).toContain('test "$tag_commit" = "$head_commit"');
    expect(windows).toContain("if ($env:GITHUB_REF -ne $tagRef)");
    expect(windows).toContain("if ($tagCommit -ne $headCommit)");
    expect(windows).not.toContain("if: startsWith(github.ref, 'refs/tags/')");
  });

  it("documents checksum and GitHub attestation trust separately", () => {
    const desktop = readFileSync("docs/desktop.md", "utf8");
    const release = readFileSync("docs/releases/v0.1.0.md", "utf8");

    for (const document of [desktop, release]) {
      expect(document).toContain(
        "gh attestation verify Doolittle-0.1.0-linux-x64.AppImage --repo SYMBaiEX/doolittle",
      );
      expect(document).toContain(
        "gh attestation verify Doolittle-0.1.0-linux-x64.deb --repo SYMBaiEX/doolittle",
      );
      expect(document).toContain(
        "gh attestation verify doolittle-desktop-linux.spdx.json --repo SYMBaiEX/doolittle",
      );
      expect(document).toMatch(
        /unsigned (integrity companion|verification records)/u,
      );
    }

    expect(desktop).toContain(
      "`release` environment must require reviewer approval and deployment tag rules",
    );
    expect(desktop).toMatch(
      /cannot prove that the live GitHub environment reviewers or deployment rules are\s+configured/u,
    );
    expect(desktop).toMatch(
      /select the exact\s+existing `v<version>` tag as the workflow ref/u,
    );
  });

  it("exercises the actual installer deliverables on their native runners", () => {
    const mac = readFileSync(producers[0] ?? "", "utf8");
    const windows = readFileSync(producers[1] ?? "", "utf8");
    const linux = readFileSync(producers[2] ?? "", "utf8");

    expect(mac).toContain("hdiutil attach");
    expect(mac).toContain("ditto -x -k");
    expect(mac).toContain(
      `app_path="$(find "$PWD/apps/desktop/release" -path '*/Doolittle.app' -type d -print -quit)"`,
    );
    expect(mac).toContain('export DOOLITTLE_SKILLS_DIR="$runtime_data/skills"');
    expect(mac).toContain(
      'export ELIZAOS_BUNDLED_SKILLS_DIR="$packaged_runtime/packages/skills"',
    );
    expect(mac).toContain(
      'installed_app="$install_root/Applications/Doolittle.app"',
    );
    expect(mac).toContain(
      'nub apps/desktop/scripts/install-macos-app.ts --source "$mount_path/Doolittle.app" --destination "$installed_app"',
    );
    expect(mac).not.toContain(
      'ditto "$mount_path/Doolittle.app" "$installed_app"',
    );
    expect(mac).toContain(
      'rm -rf "$mount_path" "$zip_path_root" "$install_root"',
    );
    expect(mac.match(/spctl --assess/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(
      mac.match(/nub run test:e2e:desktop-packaged/gu)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(windows).toContain(
      "Install, launch, and uninstall the NSIS artifact",
    );
    expect(windows).toContain("Uninstall*.exe");
    expect(linux).toContain("APPIMAGE_EXTRACT_AND_RUN=1");
    expect(linux).toContain("sudo apt-get install -y");
    expect(linux).toContain("sudo apt-get remove -y");
    expect(linux).not.toContain("AppImage.blockmap");
    expect(mac).toContain("desktop-provenance-macos.json");
    expect(windows).toContain("desktop-provenance-windows.json");
    expect(linux).toContain("desktop-provenance-linux.json");
    expect(mac).toContain("doolittle-desktop-macos.spdx.json");
    expect(windows).toContain("doolittle-desktop-windows.spdx.json");
    expect(linux).toContain("doolittle-desktop-linux.spdx.json");
    for (const workflow of [mac, windows, linux]) {
      expect(workflow).toContain("--created-at");
    }
    expect(
      mac.match(
        /nub apps\/desktop\/scripts\/verify-package\.ts --verify-signature/gu,
      ),
    ).toHaveLength(4);
    expect(mac).toContain(
      'nub apps/desktop/scripts/verify-package.ts --verify-signature "$app_path"',
    );
    expect(mac).toContain(
      'nub apps/desktop/scripts/verify-package.ts --verify-signature "$mount_path/Doolittle.app"',
    );
    expect(mac).toContain(
      'nub apps/desktop/scripts/verify-package.ts --verify-signature "$installed_app"',
    );
    expect(mac).toContain(
      'nub apps/desktop/scripts/verify-package.ts --verify-signature "$zip_path_root/Doolittle.app"',
    );
    expect(mac.match(/cmp .*app\.asar/gu)).toHaveLength(3);
    expect(windows).toContain("Get-FileHash $installedAsar");
    expect(windows).toContain("Get-AuthenticodeSignature $installedApp");
    const windowsInstall = section(
      windows,
      "      - name: Install, launch, and uninstall the NSIS artifact",
      "      - name: Upload Windows installer",
    );
    expect(
      windowsInstall.indexOf(
        "$installedSignature = Get-AuthenticodeSignature $installedApp",
      ),
    ).toBeLessThan(windowsInstall.indexOf("nub run test:e2e:desktop-packaged"));
    expect(linux.match(/cmp .*app\.asar/gu)).toHaveLength(2);
  });

  it("requires macOS signing and notarization credentials for every run", () => {
    const mac = readFileSync(producers[0] ?? "", "utf8");
    expect(mac).toContain("Require signing and notarization credentials");
    expect(mac).toContain('test -n "$CSC_LINK"');
    expect(mac).toContain('test -n "$CSC_KEY_PASSWORD"');
    expect(mac).toContain('test -n "$APPLE_ID"');
    expect(mac).toContain('test -n "$APPLE_APP_SPECIFIC_PASSWORD"');
    expect(mac).toContain('test -n "$APPLE_TEAM_ID"');
    expect(mac).toContain(
      "nub apps/desktop/scripts/package.ts --mac dmg zip --arm64 --config.mac.notarize=true",
    );
    expect(mac).not.toContain("unsigned development artifact");
    expect(mac).not.toContain("CSC_IDENTITY_AUTO_DISCOVERY=false");
    expect(mac).not.toContain("if: env.MAC_CSC_LINK != ''");
  });
});
