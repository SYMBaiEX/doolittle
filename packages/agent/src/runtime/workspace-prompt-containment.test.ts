import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextFilesService } from "../services/context-files-service";
import { discoverWorkspaceWorkflowDefinitions } from "./workflow-commands/definitions";
import { resolveWorkflowCommandPrompt } from "./workflow-commands/prompt";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, realpathSync: vi.fn(fs.realpathSync) };
});

const roots: string[] = [];
const externalText = "PRIVATE HOST CONTENT";
const workflowText = "---\ncommand: /custom\n---\nInspect {{TARGET}} locally.";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-prompt-paths-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const outside = join(root, "workspace-sibling");
  const commands = join(workspace, ".doolittle", "commands");
  mkdirSync(commands, { recursive: true });
  mkdirSync(outside);
  return { root, workspace, outside, commands };
}

afterEach(() => {
  vi.mocked(realpathSync).mockReset();
  // Keep the original filesystem implementation after one-shot race mocks.
  vi.mocked(realpathSync).mockImplementation(realpathSyncOriginal);
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function getOriginalRealpathImplementation() {
  const implementation = vi.mocked(realpathSync).getMockImplementation();
  if (!implementation) throw new Error("Filesystem mock is not initialized.");
  return implementation;
}

const realpathSyncOriginal = getOriginalRealpathImplementation();

describe("workspace workflow prompt containment", () => {
  it("loads normal workflow files and expands their prompt", () => {
    const { workspace, commands } = fixture();
    writeFileSync(join(commands, "custom.md"), workflowText);
    expect(discoverWorkspaceWorkflowDefinitions(workspace)).toHaveLength(1);
    expect(
      resolveWorkflowCommandPrompt({
        message: "/custom src",
        workspaceDir: workspace,
      })?.prompt,
    ).toBe("Inspect src locally.");
  });

  it("rejects file links to sibling-prefix host paths and recovers after replacement", () => {
    const { workspace, outside, commands } = fixture();
    const target = join(outside, "secret.md");
    writeFileSync(target, `${workflowText}\n${externalText}`);
    const linked = join(commands, "custom.md");
    symlinkSync(target, linked);
    expect(discoverWorkspaceWorkflowDefinitions(workspace)).toEqual([]);
    expect(
      resolveWorkflowCommandPrompt({
        message: "/custom",
        workspaceDir: workspace,
      }),
    ).toBeUndefined();
    expect(
      resolveWorkflowCommandPrompt({
        message: "/review",
        workspaceDir: workspace,
      })?.prompt,
    ).not.toContain(externalText);
    rmSync(linked);
    writeFileSync(linked, workflowText);
    expect(discoverWorkspaceWorkflowDefinitions(workspace)).toHaveLength(1);
  });

  it("rejects external command-directory links", () => {
    const { workspace, outside, commands } = fixture();
    writeFileSync(join(outside, "custom.md"), workflowText);
    rmSync(commands, { recursive: true });
    symlinkSync(outside, commands, "dir");
    expect(discoverWorkspaceWorkflowDefinitions(workspace)).toEqual([]);
  });

  it("preserves in-workspace directory and file links", () => {
    const { workspace, commands } = fixture();
    const internal = join(workspace, "workflow-source");
    mkdirSync(internal);
    writeFileSync(join(workspace, "source.md"), workflowText);
    symlinkSync(join(workspace, "source.md"), join(internal, "custom.md"));
    rmSync(commands, { recursive: true });
    symlinkSync(internal, commands, "dir");
    expect(discoverWorkspaceWorkflowDefinitions(workspace)).toHaveLength(1);
  });

  it("treats a missing workspace as no custom commands", () => {
    const { root } = fixture();
    expect(discoverWorkspaceWorkflowDefinitions(join(root, "missing"))).toEqual(
      [],
    );
  });

  it("ignores oversized and nonregular workflow files", () => {
    const { workspace, commands } = fixture();
    writeFileSync(join(commands, "oversize.md"), "x".repeat(1024 * 1024 + 1));
    mkdirSync(join(commands, "directory.md"));
    expect(discoverWorkspaceWorkflowDefinitions(workspace)).toEqual([]);
  });

  it("rejects a final-entry symlink swapped after canonicalization", () => {
    const { workspace, outside, commands } = fixture();
    const source = join(commands, "custom.md");
    const target = join(outside, "secret.md");
    writeFileSync(source, workflowText);
    writeFileSync(target, `${workflowText}\n${externalText}`);
    const canonicalSource = realpathSync(source);
    vi.mocked(realpathSync).mockImplementation((path, options) => {
      const result = realpathSyncOriginal(path, options);
      if (result === canonicalSource) {
        rmSync(source);
        symlinkSync(target, source);
      }
      return result;
    });
    expect(discoverWorkspaceWorkflowDefinitions(workspace)).toEqual([]);
  });
});

describe("workspace context prompt containment", () => {
  it("loads normal context files", () => {
    const { workspace } = fixture();
    writeFileSync(join(workspace, "AGENTS.md"), "Local collaborator guidance.");
    expect(new ContextFilesService(workspace).render()).toContain(
      "Local collaborator guidance.",
    );
  });

  it("blocks sibling-prefix file links even with injection scanning disabled", () => {
    const { workspace, outside } = fixture();
    const target = join(outside, "secret.md");
    writeFileSync(target, externalText);
    const linked = join(workspace, "AGENTS.md");
    symlinkSync(target, linked);
    const service = new ContextFilesService(workspace);
    const docs = service.list({ scanForInjection: false });
    expect(docs).toHaveLength(1);
    expect(docs[0].blocked).toBe(true);
    expect(JSON.stringify(docs)).not.toContain(externalText);
    expect(service.render({ scanForInjection: false })).not.toContain(
      externalText,
    );
    expect(service.renderScanReport()).toContain("BLOCKED (outside workspace)");
    rmSync(linked);
    writeFileSync(linked, "Recovered local guidance.");
    expect(service.render()).toContain("Recovered local guidance.");
  });

  it("preserves internal context links and symlink-selected workspace roots", () => {
    const { root, workspace } = fixture();
    const internal = join(workspace, "guidance.md");
    writeFileSync(internal, "Internal guidance.");
    symlinkSync(internal, join(workspace, "AGENTS.md"));
    const selectedWorkspace = join(root, "selected-workspace");
    symlinkSync(workspace, selectedWorkspace, "dir");
    expect(new ContextFilesService(selectedWorkspace).render()).toContain(
      "Internal guidance.",
    );
  });

  it("returns no context for a missing workspace", () => {
    const { root } = fixture();
    expect(new ContextFilesService(join(root, "missing")).list()).toEqual([]);
  });

  it("blocks oversized and nonregular context files", () => {
    const { workspace } = fixture();
    writeFileSync(join(workspace, "AGENTS.md"), "x".repeat(1024 * 1024 + 1));
    mkdirSync(join(workspace, "SOUL.md"));
    const service = new ContextFilesService(workspace);
    expect(service.list().map((doc) => doc.blocked)).toEqual([true, true]);
    expect(service.render()).toBe("(no workspace context files found)");
    expect(service.renderScanReport()).toContain(
      "unreadable or oversized file",
    );
  });

  it("rejects a final-entry context symlink swapped after canonicalization", () => {
    const { workspace, outside } = fixture();
    const source = join(workspace, "AGENTS.md");
    const target = join(outside, "secret.md");
    writeFileSync(source, "Normal guidance.");
    writeFileSync(target, externalText);
    const canonicalSource = realpathSync(source);
    vi.mocked(realpathSync).mockImplementation((path, options) => {
      const result = realpathSyncOriginal(path, options);
      if (result === canonicalSource) {
        rmSync(source);
        symlinkSync(target, source);
      }
      return result;
    });
    const docs = new ContextFilesService(workspace).list();
    expect(docs[0].blocked).toBe(true);
    expect(JSON.stringify(docs)).not.toContain(externalText);
  });
});
