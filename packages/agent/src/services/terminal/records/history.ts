import { existsSync, readFileSync } from "node:fs";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import type { TerminalCommandRecord } from "@/types/execution";
import type { TerminalStore } from "./command";
import { appendCommandRecord } from "./command";

const DEFAULT_COMMAND_LIMIT = 100;

export class TerminalCommandHistoryStore {
  constructor(private readonly filePath: string) {
    if (!existsSync(filePath)) {
      this.write({ commands: [] });
    }
  }

  read(): TerminalStore {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as TerminalStore;
  }

  write(store: TerminalStore): void {
    writeJsonAtomicSync(this.filePath, store);
  }

  append(
    record: TerminalCommandRecord,
    limit = DEFAULT_COMMAND_LIMIT,
  ): TerminalStore {
    const store = appendCommandRecord(this.read(), record, limit);
    this.write(store);
    return store;
  }
}
