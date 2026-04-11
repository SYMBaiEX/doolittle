import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionApprovalStoreData } from "./types";

export class ExecutionApprovalStore {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "execution-approvals.json");
    if (!existsSync(this.filePath)) {
      this.write({ approvals: [] });
    }
  }

  read(): ExecutionApprovalStoreData {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as ExecutionApprovalStoreData;
    return {
      approvals: parsed.approvals ?? [],
    };
  }

  write(store: ExecutionApprovalStoreData): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
