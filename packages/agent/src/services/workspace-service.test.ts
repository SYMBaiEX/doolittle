import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  it("searches the workspace and returns matching lines", () => {
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

      const results = service.search("linkedProviderAuth", 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.path).toContain("src/auth.ts");
      expect(results[0]?.matches.join("\n")).toContain("linkedProviderAuth");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps source dotfolders and safe templates while omitting workspace noise", () => {
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

  it("applies the same exposure policy to ripgrep and fallback search", () => {
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
      const ripgrep = searchWorkspaceWithRipgrep(root, "policy-parity", 20);

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

  it("blocks direct reads and writes of nested sensitive files", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-workspace-guard-"));
    const service = new WorkspaceService(root);

    try {
      expect(() => service.read(".env")).toThrow(
        "Workspace path is protected and cannot be read",
      );
      expect(() =>
        service.write("config/credentials.json", '{"token":"private"}'),
      ).toThrow("Workspace path is protected and cannot be written");
      expect(() => service.write("nested\\.env.local", "private")).toThrow(
        "Workspace path is protected and cannot be written",
      );

      service.write(".env.example", "API_KEY=replace-me\n");
      expect(service.read(".env.example")).toBe("API_KEY=replace-me\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not expose or follow symlinks outside the workspace", () => {
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
      expect(() => service.write("linked/created.txt", "outside")).toThrow(
        "Workspace path cannot resolve outside the workspace",
      );
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
