import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MemoryTarget } from "@/types";

const ENTRY_DELIMITER = "\n§\n";

export class MemoryService {
  private readonly fileByTarget: Record<MemoryTarget, string>;
  private readonly limitByTarget: Record<MemoryTarget, number>;

  constructor(baseDir: string, limits: Record<MemoryTarget, number>) {
    const memoryDir = join(baseDir, "memories");
    mkdirSync(memoryDir, { recursive: true });
    this.fileByTarget = {
      memory: join(memoryDir, "MEMORY.md"),
      user: join(memoryDir, "USER.md"),
    };
    this.limitByTarget = limits;
  }

  list(target: MemoryTarget): string[] {
    const file = this.fileByTarget[target];
    if (!existsSync(file)) {
      return [];
    }

    const raw = readFileSync(file, "utf8").trim();
    if (!raw) {
      return [];
    }

    return raw
      .split(ENTRY_DELIMITER)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  renderSnapshot(target: MemoryTarget): string {
    const entries = this.list(target);
    const limit = this.limitByTarget[target];
    const content = entries.join(ENTRY_DELIMITER);
    const label = target === "memory" ? "MEMORY" : "USER PROFILE";
    const usage = `${content.length}/${limit}`;
    const percent = Math.min(100, Math.round((content.length / limit) * 100));

    if (!entries.length) {
      return `${label} [0% — ${usage} chars]\n(empty)`;
    }

    return `${label} [${percent}% — ${usage} chars]\n${entries.join(ENTRY_DELIMITER)}`;
  }

  add(target: MemoryTarget, content: string): string {
    const entries = this.list(target);
    if (entries.includes(content.trim())) {
      return "No change: identical memory already exists.";
    }

    const nextEntries = [...entries, content.trim()];
    this.assertWithinLimit(target, nextEntries);
    this.write(target, nextEntries);
    return "Memory entry added.";
  }

  replace(target: MemoryTarget, oldText: string, nextText: string): string {
    const entries = this.list(target);
    const index = this.findUniqueEntryIndex(entries, oldText);
    const nextEntries = entries.slice();
    nextEntries[index] = nextText.trim();
    this.assertWithinLimit(target, nextEntries);
    this.write(target, nextEntries);
    return "Memory entry replaced.";
  }

  remove(target: MemoryTarget, oldText: string): string {
    const entries = this.list(target);
    const index = this.findUniqueEntryIndex(entries, oldText);
    const nextEntries = entries.filter((_, entryIndex) => entryIndex !== index);
    this.write(target, nextEntries);
    return "Memory entry removed.";
  }

  private write(target: MemoryTarget, entries: string[]): void {
    const file = this.fileByTarget[target];
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, entries.join(ENTRY_DELIMITER), "utf8");
  }

  private assertWithinLimit(target: MemoryTarget, entries: string[]): void {
    const nextContent = entries.join(ENTRY_DELIMITER);
    const limit = this.limitByTarget[target];
    if (nextContent.length > limit) {
      throw new Error(
        `Memory limit exceeded for ${target}: ${nextContent.length}/${limit} chars.`,
      );
    }
  }

  private findUniqueEntryIndex(entries: string[], needle: string): number {
    const matches = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.includes(needle));

    if (matches.length === 0) {
      throw new Error(`No memory entry matched "${needle}".`);
    }
    if (matches.length > 1) {
      throw new Error(`Multiple memory entries matched "${needle}". Use a more specific substring.`);
    }
    return matches[0].index;
  }
}
