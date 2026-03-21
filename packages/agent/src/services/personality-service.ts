import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PersonalityProfile } from "@/types";

interface PersonalityStore {
  activeId: string;
}

const profiles: PersonalityProfile[] = [
  {
    id: "operator",
    name: "Operator",
    description: "Default technical execution profile.",
    systemAddendum:
      "Operate like a reliable technical agent. Prioritize execution, clarity, and state continuity.",
  },
  {
    id: "concise",
    name: "Concise",
    description: "Compressed, high-signal responses.",
    systemAddendum:
      "Keep responses compact, direct, and stripped of non-essential wording while staying precise.",
  },
  {
    id: "teacher",
    name: "Teacher",
    description: "Explanatory mode for onboarding and walkthroughs.",
    systemAddendum:
      "Explain steps clearly, define assumptions, and optimize for understanding without losing accuracy.",
  },
  {
    id: "autonomous",
    name: "Autonomous",
    description: "Long-running execution and automation oriented.",
    systemAddendum:
      "Bias toward batching, automation, follow-through, and durable task state across sessions.",
  },
];

export class PersonalityService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "personality.json");
    if (!existsSync(this.filePath)) {
      this.write({ activeId: "operator" });
    }
  }

  list(): PersonalityProfile[] {
    return profiles;
  }

  get(id: string): PersonalityProfile | undefined {
    return profiles.find((profile) => profile.id === id);
  }

  getActive(): PersonalityProfile {
    const store = this.read();
    return (
      profiles.find((profile) => profile.id === store.activeId) ?? profiles[0]
    );
  }

  setActive(id: string): PersonalityProfile {
    const profile = profiles.find((candidate) => candidate.id === id);
    if (!profile) {
      throw new Error(`Unknown personality: ${id}`);
    }
    this.write({ activeId: profile.id });
    return profile;
  }

  activeId(): string {
    return this.getActive().id;
  }

  summary(): {
    total: number;
    activeId?: string;
    names: string[];
  } {
    const available = this.list();
    const active = this.getActive();
    return {
      total: available.length,
      activeId: active.id,
      names: available.map((profile) => profile.name),
    };
  }

  private read(): PersonalityStore {
    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as PersonalityStore;
  }

  private write(store: PersonalityStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
