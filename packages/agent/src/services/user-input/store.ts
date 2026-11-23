import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/core";
import type { UserInputRequestStoreData } from "./types";

export class UserInputRequestStore {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "input-requests.json");
    if (!existsSync(this.filePath)) {
      this.write({ requests: [] });
    }
  }

  read(): UserInputRequestStoreData {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as UserInputRequestStoreData;
    return {
      requests: parsed.requests ?? [],
    };
  }

  write(store: UserInputRequestStoreData): void {
    writeJsonAtomicSync(this.filePath, store);
  }
}
