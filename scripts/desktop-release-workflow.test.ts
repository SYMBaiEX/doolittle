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
    secrets:
      WIN_CSC_LINK:
        required: false
      WIN_CSC_KEY_PASSWORD:
        required: false
  workflow_dispatch:`);
    expect(linux).toContain("workflow_call:\n  workflow_dispatch:");
    expect(linux).not.toContain("secrets:");
    expect(source.match(/needs: preflight/gu)).toHaveLength(3);
    expect(source).toContain("nub audit --production --audit-level high");
    expect(source).toContain(
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
    );
    expect(source).toContain("needs: [macos, windows, linux]");
    expect(source).toContain("nub scripts/create-desktop-release.ts");
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
    expect(mac).toContain('ditto "$mount_path/Doolittle.app" "$installed_app"');
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
    expect(mac).toContain("verify-package.ts --verify-signature");
    expect(mac.match(/cmp .*app\.asar/gu)).toHaveLength(3);
    expect(windows).toContain("Get-FileHash $installedAsar");
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
