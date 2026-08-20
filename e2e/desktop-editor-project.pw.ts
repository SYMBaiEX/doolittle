import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const repoRoot = process.cwd();
const desktopRoot = resolve(repoRoot, "apps/desktop");

test.describe("Doolittle editor project resolution", () => {
  test("resolves workspace aliases and pnpm packages without false diagnostics", async () => {
    test.setTimeout(120_000);
    const profileDir = mkdtempSync(join(tmpdir(), "doolittle-editor-profile-"));
    const workspaceDir = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-editor-workspace-")),
    );
    const packageStore = join(
      workspaceDir,
      "node_modules/.pnpm/example@1.0.0/node_modules/example",
    );
    const packageLink = join(workspaceDir, "node_modules/example");
    const linkType = process.platform === "win32" ? "junction" : "dir";

    mkdirSync(join(workspaceDir, "app"), { recursive: true });
    mkdirSync(join(workspaceDir, "components"), { recursive: true });
    mkdirSync(join(packageStore, "dist"), { recursive: true });
    writeFileSync(
      join(profileDir, "workspace-state.json"),
      `${JSON.stringify({
        currentPath: workspaceDir,
        recentPaths: [workspaceDir],
      })}\n`,
      "utf8",
    );
    writeFileSync(
      join(workspaceDir, "tsconfig.json"),
      `${JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          paths: { "@/*": ["./*"] },
          strict: true,
        },
        include: ["app/**/*.ts", "components/**/*.ts"],
      })}\n`,
      "utf8",
    );
    writeFileSync(
      join(workspaceDir, "components", "thing.ts"),
      "export const localThing = 1;\n",
      "utf8",
    );
    writeFileSync(
      join(packageStore, "package.json"),
      `${JSON.stringify({
        name: "example",
        version: "1.0.0",
        exports: {
          "./subpath": {
            types: "./dist/subpath.d.ts",
            default: "./dist/subpath.js",
          },
        },
      })}\n`,
      "utf8",
    );
    writeFileSync(
      join(packageStore, "dist", "subpath.d.ts"),
      "export declare const packageThing: number;\n",
      "utf8",
    );
    symlinkSync(packageStore, packageLink, linkType);
    writeFileSync(
      join(workspaceDir, "app", "page.ts"),
      [
        'import { localThing } from "@/components/thing";',
        'import { packageThing } from "example/subpath";',
        "export const result = localThing + packageThing;",
        "",
      ].join("\n"),
      "utf8",
    );

    const app = await electron.launch({
      args: [desktopRoot, `--user-data-dir=${profileDir}`],
      cwd: repoRoot,
      env: {
        ...process.env,
        DOOLITTLE_DESKTOP_CWD: workspaceDir,
        DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
        DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
      },
    });

    try {
      const page = await app.firstWindow();
      await expect(page.locator(".window-runtime-status.ready")).toContainText(
        "Local runtime",
        { timeout: 45_000 },
      );
      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      const view = page.locator('.view-container[data-view="code"]');
      await expect(view).toBeVisible();
      await expect(
        view.getByRole("tree", { name: "Workspace files" }),
      ).toBeVisible({ timeout: 15_000 });
      await view.getByRole("button", { name: "Expand all folders" }).click();
      await view.locator('[role="treeitem"][title="app/page.ts"]').click();
      const editor = view.locator(".doolittle-code-editor");
      await expect(editor).toBeVisible();
      await page.waitForTimeout(2_000);
      await expect(editor.locator(".squiggly-error")).toHaveCount(0);
    } finally {
      await app.close();
      rmSync(profileDir, { force: true, recursive: true });
      rmSync(workspaceDir, { force: true, recursive: true });
    }
  });
});
