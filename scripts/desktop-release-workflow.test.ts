import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findMutableWorkflowActions } from "./check-workflow-security";

const producers = [
  ".github/workflows/desktop-macos.yml",
  ".github/workflows/desktop-windows.yml",
  ".github/workflows/desktop-linux.yml",
];

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
    expect(source).toContain('      - "v*"');
    expect(source).toContain("uses: ./.github/workflows/desktop-macos.yml");
    expect(source).toContain("uses: ./.github/workflows/desktop-windows.yml");
    expect(source).toContain("uses: ./.github/workflows/desktop-linux.yml");
    expect(source.match(/secrets: inherit/gu)).toHaveLength(3);
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
    expect(mac.match(/spctl --assess/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(
      mac.match(/nub run test:e2e:desktop-packaged/gu)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(windows).toContain(
      "Install, launch, and uninstall the NSIS artifact",
    );
    expect(windows).toContain("Uninstall*.exe");
    expect(linux).toContain("APPIMAGE_EXTRACT_AND_RUN=1");
    expect(linux).toContain("sudo apt-get install -y");
    expect(linux).toContain("sudo apt-get remove -y");
    expect(linux).not.toContain("AppImage.blockmap");
  });
});
