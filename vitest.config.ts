import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@elizaos\/registry$/,
        replacement: fromRoot("./packages/registry/src/index.js"),
      },
      {
        // 2.0.3-beta.7 publishes a development export that points at an
        // unpublished src/index.ts. Vitest enables that condition, so tests
        // must use the package's shipped production entrypoint.
        find: /^@elizaos\/skills$/,
        replacement: fromRoot("./node_modules/@elizaos/skills/dist/index.js"),
      },
      {
        find: /^@elizaos\/registry\/first-party\/(.+)$/,
        replacement: `${fromRoot("./packages/registry/src/first-party")}/$1`,
      },
      {
        find: /^dotenv$/,
        replacement: fromRoot("./node_modules/dotenv/lib/main.js"),
      },
      {
        find: /^@elizaos\/ui\/components\/ui\/(button|input|textarea|select)$/,
        replacement: fromRoot(
          "./apps/desktop/src/renderer/components/ElizaControls.tsx",
        ),
      },
      { find: "@", replacement: fromRoot("./packages/agent/src") },
      {
        find: "@doolittle/acp",
        replacement: fromRoot("./packages/acp/src/index.ts"),
      },
      {
        find: "@doolittle/contracts",
        replacement: fromRoot("./packages/contracts/src/index.ts"),
      },
      {
        find: "@doolittle/agent",
        replacement: fromRoot("./packages/agent/src"),
      },
      { find: "@plugins", replacement: fromRoot("./packages/plugins") },
      { find: "@characters", replacement: fromRoot("./packages/characters") },
    ],
  },
  test: {
    clearMocks: true,
    restoreMocks: true,
    server: {
      deps: {
        inline: ["@elizaos/plugin-agent-skills", "@elizaos/skills"],
      },
    },
    testTimeout: 15_000,
  },
});
