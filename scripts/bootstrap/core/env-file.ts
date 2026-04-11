import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface EnvFileOptions {
  envPath: string;
  envExamplePath: string;
  checkOnly: boolean;
}

export function ensureEnvFile({
  envPath,
  envExamplePath,
  checkOnly,
}: EnvFileOptions): string[] {
  const messages: string[] = [];
  if (existsSync(envPath)) {
    messages.push(".env already exists");
    return messages;
  }

  if (!existsSync(envExamplePath)) {
    messages.push(".env.example is missing");
    return messages;
  }

  if (checkOnly) {
    messages.push(".env would be created from .env.example");
    return messages;
  }

  writeFileSync(envPath, readFileSync(envExamplePath, "utf8"), "utf8");
  messages.push(".env created from .env.example");
  return messages;
}

export function readEnvEntries(envPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(envPath)) {
    return map;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    map.set(key, value);
  }
  return map;
}

export function updateEnvFile(
  updates: Record<string, string | undefined>,
  options: Pick<EnvFileOptions, "envPath" | "checkOnly">,
): string[] {
  const messages: string[] = [];
  if (!existsSync(options.envPath)) {
    return [".env is missing"];
  }

  const lines = readFileSync(options.envPath, "utf8").split(/\r?\n/);
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    if (!line || line.trim().startsWith("#")) {
      return line;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      return line;
    }
    const key = line.slice(0, separator).trim();
    if (!(key in updates)) {
      return line;
    }
    seen.add(key);
    const value = updates[key];
    messages.push(`${key} ${value ? "updated" : "cleared"}`);
    return `${key}=${value ?? ""}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) {
      continue;
    }
    nextLines.push(`${key}=${value ?? ""}`);
    messages.push(`${key} added`);
  }

  if (!options.checkOnly) {
    writeFileSync(options.envPath, nextLines.join("\n"), "utf8");
  }

  return messages;
}
