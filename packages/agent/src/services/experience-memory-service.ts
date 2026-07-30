import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_LOCAL_USER_ID } from "@/runtime/message-user";
import type { MemoryTarget } from "@/types";
import type { UserProfileService } from "./user-profile/service";

const ENTRY_DELIMITER = "\n§\n";

export interface MemorySummary {
  target: MemoryTarget;
  entries: number;
  characters: number;
  preview: string[];
}

export class ExperienceMemoryService {
  private readonly sharedFile: string;
  private readonly legacyUserFile: string;
  private readonly limitByTarget: Record<MemoryTarget, number>;

  constructor(
    baseDir: string,
    limits: Record<MemoryTarget, number>,
    private readonly userProfiles: UserProfileService,
  ) {
    const memoryDir = join(baseDir, "memories");
    mkdirSync(memoryDir, { recursive: true });
    this.sharedFile = join(memoryDir, "MEMORY.md");
    this.legacyUserFile = join(memoryDir, "USER.md");
    this.limitByTarget = limits;
    this.migrateLegacyUserMemory();
  }

  list(target: MemoryTarget, userId = DEFAULT_LOCAL_USER_ID): string[] {
    if (target === "user") {
      return [...(this.userProfiles.get(userId).explicitMemories ?? [])];
    }
    if (!existsSync(this.sharedFile)) {
      return [];
    }

    const raw = readFileSync(this.sharedFile, "utf8").trim();
    if (!raw) {
      return [];
    }

    return raw
      .split(ENTRY_DELIMITER)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  renderSnapshot(target: MemoryTarget, userId = DEFAULT_LOCAL_USER_ID): string {
    const entries = this.list(target, userId);
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

  summary(
    target: MemoryTarget = "memory",
    userId = DEFAULT_LOCAL_USER_ID,
  ): MemorySummary {
    const entries = this.list(target, userId);
    const snapshot = this.read(target, userId);
    return {
      target,
      entries: entries.length,
      characters: snapshot.length,
      preview: entries.slice(-5),
    };
  }

  add(
    target: MemoryTarget,
    content: string,
    userId = DEFAULT_LOCAL_USER_ID,
  ): string {
    const entries = this.list(target, userId);
    if (entries.includes(content.trim())) {
      return "No change: identical memory already exists.";
    }

    const nextEntries = [...entries, content.trim()];
    this.assertWithinLimit(target, nextEntries);
    this.write(target, nextEntries, userId);
    return "Memory entry added.";
  }

  remember(
    target: MemoryTarget,
    input: { text: string; source?: string },
    userId = DEFAULT_LOCAL_USER_ID,
  ): {
    ok: boolean;
    stored: string;
    totalLength: number;
    truncated: boolean;
  } {
    const entry = input.source
      ? `[${input.source}] ${input.text.trim()}`
      : input.text.trim();
    const stored = this.add(target, entry, userId);
    const snapshot = this.read(target, userId);
    return {
      ok: true,
      stored,
      totalLength: snapshot.length,
      truncated: false,
    };
  }

  read(
    target: MemoryTarget = "memory",
    userId = DEFAULT_LOCAL_USER_ID,
  ): string {
    return this.list(target, userId).join(ENTRY_DELIMITER);
  }

  replace(
    target: MemoryTarget,
    oldText: string,
    nextText: string,
    userId = DEFAULT_LOCAL_USER_ID,
  ): string {
    const entries = this.list(target, userId);
    const index = this.findUniqueEntryIndex(entries, oldText);
    const nextEntries = entries.slice();
    nextEntries[index] = nextText.trim();
    this.assertWithinLimit(target, nextEntries);
    this.write(target, nextEntries, userId);
    return "Memory entry replaced.";
  }

  remove(
    target: MemoryTarget,
    oldText: string,
    userId = DEFAULT_LOCAL_USER_ID,
  ): string {
    const entries = this.list(target, userId);
    const index = this.findUniqueEntryIndex(entries, oldText);
    const nextEntries = entries.filter((_, entryIndex) => entryIndex !== index);
    this.write(target, nextEntries, userId);
    return "Memory entry removed.";
  }

  private write(target: MemoryTarget, entries: string[], userId: string): void {
    if (target === "user") {
      this.userProfiles.setExplicitMemories(
        userId,
        entries,
        "experience-memory",
      );
      return;
    }
    mkdirSync(dirname(this.sharedFile), { recursive: true });
    writeFileSync(this.sharedFile, entries.join(ENTRY_DELIMITER), "utf8");
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
      throw new Error(
        `Multiple memory entries matched "${needle}". Use a more specific substring.`,
      );
    }
    return matches[0].index;
  }

  private migrateLegacyUserMemory(): void {
    if (!existsSync(this.legacyUserFile)) {
      return;
    }
    const raw = readFileSync(this.legacyUserFile, "utf8").trim();
    const entries = raw
      ? raw
          .split(ENTRY_DELIMITER)
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
    if (entries.length > 0) {
      const profile = this.userProfiles.get(DEFAULT_LOCAL_USER_ID);
      const explicitMemories = [...(profile.explicitMemories ?? [])];
      for (const entry of entries) {
        const fact = entry.match(/^User fact:\s*(.+)$/u)?.[1]?.trim();
        if (fact) {
          this.userProfiles.remember(
            DEFAULT_LOCAL_USER_ID,
            "fact",
            fact,
            "legacy-user-memory-migration",
          );
          continue;
        }
        const preference = entry
          .match(/^User preference:\s*(.+)$/u)?.[1]
          ?.trim();
        if (preference) {
          this.userProfiles.remember(
            DEFAULT_LOCAL_USER_ID,
            "preference",
            preference,
            "legacy-user-memory-migration",
          );
          continue;
        }
        const displayName = entry
          .match(/^User display name:\s*(.+)$/u)?.[1]
          ?.trim();
        if (displayName && displayName === profile.displayName) {
          continue;
        }
        explicitMemories.push(entry);
      }
      this.userProfiles.setExplicitMemories(
        DEFAULT_LOCAL_USER_ID,
        explicitMemories,
        "legacy-user-memory-migration",
      );
    }
    const migratedBase = `${this.legacyUserFile}.migrated`;
    let migratedPath = migratedBase;
    let suffix = 1;
    while (existsSync(migratedPath)) {
      migratedPath = `${migratedBase}.${suffix}`;
      suffix += 1;
    }
    renameSync(this.legacyUserFile, migratedPath);
  }
}
