import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/core";
import type { ExecutionApprovalStoreData } from "./types";

export class ExecutionApprovalStore {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "execution-approvals.json");
    if (!existsSync(this.filePath)) {
      this.write({ approvals: [], rules: [] });
    }
  }

  read(): ExecutionApprovalStoreData {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ExecutionApprovalStoreData>;
    return {
      approvals: parsed.approvals ?? [],
      rules: parsed.rules ?? [],
    };
  }

  write(store: ExecutionApprovalStoreData): void {
    writeJsonAtomicSync(this.filePath, store);
  }
}
