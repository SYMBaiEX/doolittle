import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";

export async function resetPgliteDataDir(dataDir: string): Promise<void> {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "")
    .replace("T", "-");
  const backupDir = `${dataDir}.corrupt-${stamp}`;

  if (existsSync(dataDir)) {
    try {
      renameSync(dataDir, backupDir);
    } catch {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }

  mkdirSync(dataDir, { recursive: true });
}

export async function resetPluginSqlPgliteSingleton(): Promise<void> {
  const singletonKey = Symbol.for("@elizaos/plugin-sql/global-singletons");
  const singletons = (
    globalThis as typeof globalThis & {
      [key: symbol]: {
        pgLiteClientManager?: { close?: () => Promise<void> | void };
      };
    }
  )[singletonKey];

  if (!singletons?.pgLiteClientManager) {
    return;
  }

  try {
    await singletons.pgLiteClientManager.close?.();
  } catch {
    // Best effort only. We'll still drop the singleton reference below.
  }

  delete singletons.pgLiteClientManager;
}
