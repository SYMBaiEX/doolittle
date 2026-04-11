import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
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
