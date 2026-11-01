import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const fromRoot = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        // 2.0.3-beta.7 publishes a development export that points at an
        // unpublished src/index.ts. Vitest enables that condition, so tests
        // must use the package's shipped production entrypoint.
        find: /^@elizaos\/skills$/,
        replacement: fromRoot("./node_modules/@elizaos/skills/dist/index.js"),
      },
      {
        find: /^dotenv$/,
        replacement: fromRoot("./node_modules/dotenv/dist/index.cjs"),
      },
      {
        find: /^@elizaos\/ui\/components\/ui\/(button|input|textarea|select)$/,
        replacement: fromRoot(
          "./apps/desktop/src/renderer/components/ElizaControls.tsx",
        ),
      },
    ],
  },
  test: {
    // The complete fast suite is deliberately small and lives in one place.
    // Native process/Electron journeys run through their explicit E2E gates.
    include: ["tests/boundary/**/*.test.{ts,tsx}"],
    exclude: [
      ...configDefaults.exclude,
      "**/dist/**",
      "apps/desktop/build/**",
      "apps/desktop/release/**",
      "**/.generated/**",
    ],
    clearMocks: true,
    restoreMocks: true,
    // Real SDK subprocess fixtures share the host with renderer transforms.
    // Match the essential lane's worker budget without relaxing deadlines,
    // excluding behavior coverage, or disabling per-file isolation.
    maxWorkers: 2,
    server: {
      deps: {
        inline: ["@elizaos/plugin-agent-skills", "@elizaos/skills"],
      },
    },
    testTimeout: 15_000,
  },
});
