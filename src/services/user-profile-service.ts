import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UserProfileRecord } from "@/types";

interface UserProfileStore {
  profiles: UserProfileRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export class UserProfileService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "user-profiles.json");
    if (!existsSync(this.filePath)) {
      this.write({ profiles: [] });
    }
  }

  list(): UserProfileRecord[] {
    return this.read().profiles.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(userId: string): UserProfileRecord {
    const existing = this.read().profiles.find((profile) => profile.userId === userId);
    return (
      existing ?? {
        userId,
        preferences: [],
        facts: [],
        notes: [],
        lastSeenAt: nowIso(),
        updatedAt: nowIso(),
      }
    );
  }

  addNote(userId: string, note: string, source?: string): UserProfileRecord {
    return this.update(userId, (profile) => {
      profile.notes = unique([...profile.notes, note]);
      profile.lastSource = source ?? profile.lastSource;
    });
  }

  observe(userId: string, message: string, source?: string): UserProfileRecord {
    const observation = message.trim();
    return this.update(userId, (profile) => {
      const lower = observation.toLowerCase();
      const preference = observation.match(/\b(?:i prefer|i like|i usually use)\s+(.+?)(?:[.!?]|$)/iu);
      const fact = observation.match(/\b(?:my name is|i am|i'm)\s+(.+?)(?:[.!?]|$)/iu);

      if (preference?.[1] && preference[1].length < 160) {
        profile.preferences = unique([...profile.preferences, preference[1]]);
      }
      if (fact?.[1] && fact[1].length < 160) {
        if (lower.startsWith("my name is")) {
          profile.displayName = fact[1].trim();
        } else {
          profile.facts = unique([...profile.facts, fact[1]]);
        }
      }
      if (
        /remember|save this|important|note that|keep in mind/iu.test(observation) &&
        observation.length < 240
      ) {
        profile.notes = unique([...profile.notes, observation]);
      }

      profile.lastSource = source ?? profile.lastSource;
    });
  }

  render(userId: string): string {
    const profile = this.get(userId);
    return [
      `USER PROFILE: ${profile.displayName ?? profile.userId}`,
      `Last seen: ${profile.lastSeenAt}`,
      `Source: ${profile.lastSource ?? "unknown"}`,
      "",
      "Preferences",
      ...(profile.preferences.length ? profile.preferences.map((item) => `- ${item}`) : ["- (none)"]),
      "",
      "Facts",
      ...(profile.facts.length ? profile.facts.map((item) => `- ${item}`) : ["- (none)"]),
      "",
      "Notes",
      ...(profile.notes.length ? profile.notes.map((item) => `- ${item}`) : ["- (none)"]),
    ].join("\n");
  }

  private update(userId: string, mutate: (profile: UserProfileRecord) => void): UserProfileRecord {
    const store = this.read();
    const existingIndex = store.profiles.findIndex((profile) => profile.userId === userId);
    const base =
      existingIndex >= 0
        ? store.profiles[existingIndex]
        : {
            userId,
            preferences: [],
            facts: [],
            notes: [],
            lastSeenAt: nowIso(),
            updatedAt: nowIso(),
          };

    const next: UserProfileRecord = {
      ...base,
      preferences: [...base.preferences],
      facts: [...base.facts],
      notes: [...base.notes],
      lastSeenAt: nowIso(),
      updatedAt: nowIso(),
    };

    mutate(next);

    if (existingIndex >= 0) {
      store.profiles[existingIndex] = next;
    } else {
      store.profiles.push(next);
    }
    this.write(store);
    return next;
  }

  private read(): UserProfileStore {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as UserProfileStore;
  }

  private write(store: UserProfileStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
