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
        find: /^@elizaos\/registry\/first-party\/(.+)$/,
        replacement: `${fromRoot("./packages/registry/src/first-party")}/$1`,
      },
      {
        find: /^dotenv$/,
        replacement: fromRoot("./node_modules/dotenv/lib/main.js"),
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
        find: "@doolittle/logger",
        replacement: fromRoot("./packages/logger/src/index.ts"),
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
    testTimeout: 15_000,
  },
});
