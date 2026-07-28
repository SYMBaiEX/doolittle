import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceService } from "./workspace-service/index";
import {
  classifyWorkspacePath,
  normalizeWorkspacePolicyPath,
} from "./workspace-service/policy";
import {
  searchWorkspaceWithoutRipgrep,
  searchWorkspaceWithRipgrep,
} from "./workspace-service/search";

describe("WorkspaceService", () => {
  it("creates a Git checkpoint without changing the worktree and restores only after an explicit service call", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-workspace-checkpoint-"));
    const service = new WorkspaceService(root);

    try {
      const git = (args: string[]) =>
        execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
      git(["init"]);
      git(["config", "user.name", "Test User"]);
      git(["config", "user.email", "test@example.invalid"]);
      writeFileSync(join(root, "tracked.txt"), "base\n", "utf8");
      git(["add", "tracked.txt"]);
      git(["commit", "-m", "initial"]);

      writeFileSync(join(root, "tracked.txt"), "checkpoint value\n", "utf8");
      writeFileSync(join(root, "untracked.txt"), "captured\n", "utf8");
      const before = git(["status", "--porcelain"]);
      const checkpoint = await service.createCheckpoint("Before mutation");

      await expect(service.checkpointSupport()).resolves.toEqual({
        supported: true,
      });
      expect(await service.listCheckpoints()).toContainEqual(
        expect.objectContaining({
          id: checkpoint.id,
          label: "Before mutation",
        }),
      );
      expect(git(["status", "--porcelain"])).toBe(before);

      writeFileSync(join(root, "tracked.txt"), "after mutation\n", "utf8");
      await service.restoreCheckpoint(checkpoint.id);
      expect(service.read("tracked.txt")).toBe("checkpoint value\n");
      expect(service.read("untracked.txt")).toBe("captured\n");
      const recoveryCheckpoint = (await service.listCheckpoints()).find(
        (candidate) =>
          candidate.label.startsWith("Before restoring: Before mutation"),
      );
      expect(recoveryCheckpoint).toBeDefined();
      expect(
        git(["show", `${recoveryCheckpoint?.revision ?? ""}:tracked.txt`]),
      ).toBe("after mutation\n");

      const checkpointCount = (await service.listCheckpoints()).length;
      await service.write("tracked.txt", "agent write\n");
      expect(await service.listCheckpoints()).toHaveLength(checkpointCount + 1);
      expect(service.read("tracked.txt")).toBe("agent write\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to persist protected uncommitted files in checkpoint objects", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-workspace-private-checkpoint-"),
    );
    const service = new WorkspaceService(root);

    try {
      const git = (args: string[]) =>
        execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
      git(["init"]);
      git(["config", "user.name", "Test User"]);
      git(["config", "user.email", "test@example.invalid"]);
      writeFileSync(join(root, "tracked.txt"), "base\n", "utf8");
      git(["add", "tracked.txt"]);
      git(["commit", "-m", "initial"]);
      writeFileSync(join(root, ".env.local"), "PRIVATE=value\n", "utf8");

      await expect(service.createCheckpoint("Unsafe snapshot")).rejects.toThrow(
        "Checkpoint blocked because protected workspace data has uncommitted changes: .env.local",
      );
      await expect(
        service.write("tracked.txt", "agent write\n"),
      ).rejects.toThrow(
        "Workspace write was not performed because its safety checkpoint failed",
      );
      expect(service.read("tracked.txt")).toBe("base\n");
      await expect(service.listCheckpoints()).resolves.toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports non-Git workspace checkpoint support without changing write behavior", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-workspace-no-checkpoint-"),
    );
    const service = new WorkspaceService(root);
    try {
      await expect(service.checkpointSupport()).resolves.toEqual({
        supported: false,
        reason: "The workspace is not a Git repository.",
      });
      await service.write("notes.txt", "still writes\n");
      expect(service.read("notes.txt")).toBe("still writes\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("follows a live workspace source without rebuilding the service", () => {
    const first = mkdtempSync(join(tmpdir(), "doolittle-workspace-first-"));
    const second = mkdtempSync(join(tmpdir(), "doolittle-workspace-second-"));
    let workspaceDir = first;
    const service = new WorkspaceService(() => workspaceDir);

    try {
      writeFileSync(join(first, "marker.txt"), "first\n", "utf8");
      writeFileSync(join(second, "marker.txt"), "second\n", "utf8");
      expect(service.root()).toBe(first);
      expect(service.read("marker.txt")).toBe("first\n");

      workspaceDir = second;
      expect(service.root()).toBe(second);
      expect(service.read("marker.txt")).toBe("second\n");
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it("searches the workspace and returns matching lines", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-workspace-"));
    const service = new WorkspaceService(root);

    try {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "auth.ts"),
        [
          "export const provider = 'elizacloud';",
          "export const linkedProviderAuth = true;",
          "export const secondary = 'auth linked provider';",
        ].join("\n"),
        "utf8",
      );

      const results = await service.search("linkedProviderAuth", 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.path).toContain("src/auth.ts");
      expect(results[0]?.matches.join("\n")).toContain("linkedProviderAuth");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps source dotfolders and safe templates while omitting workspace noise", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-workspace-policy-"));
    const service = new WorkspaceService(root);

    try {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      mkdirSync(join(root, ".playwright-cli"), { recursive: true });
      mkdirSync(join(root, ".claude"), { recursive: true });
      mkdirSync(join(root, "release"), { recursive: true });
      mkdirSync(join(root, "packages", "app", "dist"), { recursive: true });
      mkdirSync(join(root, "packages", "app", "config"), { recursive: true });
      writeFileSync(join(root, ".env.example"), "API_KEY=replace-me\n", "utf8");
      writeFileSync(join(root, ".env.local"), "API_KEY=private\n", "utf8");
      writeFileSync(
        join(root, ".github", "workflows", "ci.yml"),
        "name: CI\n",
        "utf8",
      );
      writeFileSync(
        join(root, ".playwright-cli", "page-session.yml"),
        "generated\n",
        "utf8",
      );
      writeFileSync(
        join(root, ".claude", "settings.local.json"),
        '{"permissions":[]}\n',
        "utf8",
      );
      writeFileSync(join(root, "release", "builder-debug.yml"), "build\n");
      writeFileSync(join(root, "agent-turn-tscheck.json"), "{}\n");
      writeFileSync(
        join(root, "packages", "app", "dist", "bundle.js"),
        "generated\n",
        "utf8",
      );
      writeFileSync(
        join(root, "packages", "app", "config", "credentials.json"),
        '{"token":"private"}\n',
        "utf8",
      );

      const paths = service.tree(8).map((entry) => entry.path);
      expect(paths).toContain(".github");
      expect(paths).toContain(".github/workflows/ci.yml");
      expect(paths).toContain(".env.example");
      expect(paths).not.toContain(".env.local");
      expect(paths).not.toContain(".playwright-cli");
      expect(paths).not.toContain(".claude/settings.local.json");
      expect(paths).not.toContain("release");
      expect(paths).not.toContain("agent-turn-tscheck.json");
      expect(paths).not.toContain("packages/app/dist");
      expect(paths).not.toContain("packages/app/config/credentials.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies the same exposure policy to ripgrep and fallback search", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-workspace-search-"));

    try {
      mkdirSync(join(root, "src"), { recursive: true });
      mkdirSync(join(root, "nested", "dist"), { recursive: true });
      mkdirSync(join(root, "nested", "config"), { recursive: true });
      writeFileSync(join(root, "src", "app.ts"), "policy-parity\n", "utf8");
      writeFileSync(
        join(root, ".env.example"),
        "VALUE=policy-parity\n",
        "utf8",
      );
      writeFileSync(
        join(root, "nested", ".env.production"),
        "VALUE=policy-parity\n",
        "utf8",
      );
      writeFileSync(
        join(root, "nested", "dist", "bundle.js"),
        "policy-parity\n",
        "utf8",
      );
      writeFileSync(
        join(root, "nested", "config", "client_secret.json"),
        '{"value":"policy-parity"}\n',
        "utf8",
      );

      const fallback = searchWorkspaceWithoutRipgrep(root, "policy-parity", 20);
      const ripgrep = await searchWorkspaceWithRipgrep(
        root,
        "policy-parity",
        20,
      );

      expect(ripgrep).toBeDefined();
      expect(ripgrep?.map((result) => result.path).sort()).toEqual(
        fallback.map((result) => result.path).sort(),
      );
      expect(fallback.map((result) => result.path).sort()).toEqual([
        ".env.example",
        "src/app.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks direct reads and writes of nested sensitive files", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-workspace-guard-"));
    const service = new WorkspaceService(root);

    try {
      expect(() => service.read(".env")).toThrow(
        "Workspace path is protected and cannot be read",
      );
      await expect(
        service.write("config/credentials.json", '{"token":"private"}'),
      ).rejects.toThrow("Workspace path is protected and cannot be written");
      await expect(
        service.write("nested\\.env.local", "private"),
      ).rejects.toThrow("Workspace path is protected and cannot be written");

      await service.write(".env.example", "API_KEY=replace-me\n");
      expect(service.read(".env.example")).toBe("API_KEY=replace-me\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not expose or follow symlinks outside the workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-workspace-links-"));
    const outside = mkdtempSync(join(tmpdir(), "doolittle-workspace-outside-"));
    const service = new WorkspaceService(root);

    try {
      writeFileSync(join(outside, "private.txt"), "outside\n", "utf8");
      symlinkSync(outside, join(root, "linked"));

      expect(service.tree(4).map((entry) => entry.path)).not.toContain(
        "linked",
      );
      expect(() => service.read("linked/private.txt")).toThrow(
        "Workspace path cannot resolve outside the workspace",
      );
      await expect(
        service.write("linked/created.txt", "outside"),
      ).rejects.toThrow("Workspace path cannot resolve outside the workspace");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("workspace path policy", () => {
  it("normalizes Windows and POSIX relative paths consistently", () => {
    expect(normalizeWorkspacePolicyPath(".\\src\\..\\config\\.env.local")).toBe(
      "config/.env.local",
    );
    expect(normalizeWorkspacePolicyPath("./src/../config/.env.local")).toBe(
      "config/.env.local",
    );
  });

  it("recognizes nested sensitive names without hiding safe templates", () => {
    expect(
      classifyWorkspacePath("packages\\app\\config\\credentials.yaml")
        .disposition,
    ).toBe("sensitive");
    expect(classifyWorkspacePath("infra/prod.auto.tfvars").disposition).toBe(
      "sensitive",
    );
    expect(classifyWorkspacePath("keys/signing.pem").disposition).toBe(
      "sensitive",
    );
    expect(classifyWorkspacePath(".env.example").disposition).toBe("visible");
    expect(
      classifyWorkspacePath("config/credentials.example.json").disposition,
    ).toBe("visible");
    expect(classifyWorkspacePath(".env.example.local").disposition).toBe(
      "sensitive",
    );
    expect(classifyWorkspacePath(".github/workflows/ci.yml").disposition).toBe(
      "visible",
    );
    expect(
      classifyWorkspacePath(".claude/settings.local.json").disposition,
    ).toBe("sensitive");
    expect(classifyWorkspacePath(".playwright-cli/page.yml").disposition).toBe(
      "noise",
    );
  });
});
