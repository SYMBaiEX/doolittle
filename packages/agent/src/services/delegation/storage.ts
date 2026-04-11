import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DelegationTaskRecord } from "@/types";

export interface DelegationStore {
  tasks: DelegationTaskRecord[];
}

export class DelegationTaskStore {
  readonly filePath: string;
  readonly workersDir: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "delegation-tasks.json");
    this.workersDir = join(baseDir, "workers");
    mkdirSync(this.workersDir, { recursive: true });
    if (!existsSync(this.filePath)) {
      this.write({ tasks: [] });
    }
  }

  read(): DelegationStore {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as DelegationStore;
  }

  write(store: DelegationStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  getWorkerPaths(id: string): { inputPath: string; outputPath: string } {
    return {
      inputPath: join(this.workersDir, `${id}-input.json`),
      outputPath: join(this.workersDir, `${id}-output.json`),
    };
  }
}
