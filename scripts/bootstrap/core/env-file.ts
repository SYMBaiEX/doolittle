import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";

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

  try {
    // Exclusive creation cannot overwrite a file or symlink created after
    // the advisory existence check. Environment files can contain secrets.
    writeFileSync(envPath, readFileSync(envExamplePath, "utf8"), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return [".env already exists"];
    }
    throw error;
  }
  messages.push(".env created from .env.example");
  return messages;
}

export function readEnvEntries(envPath: string): Map<string, string> {
  const map = new Map<string, string>();
  let descriptor: number;
  try {
    descriptor = openSync(
      envPath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return map;
    throw error;
  }
  let lines: string[];
  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new Error(".env must be a regular file");
    }
    lines = readFileSync(descriptor, "utf8").split(/\r?\n/);
  } finally {
    closeSync(descriptor);
  }
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
  let descriptor: number;
  try {
    descriptor = openSync(
      options.envPath,
      (options.checkOnly ? constants.O_RDONLY : constants.O_RDWR) |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [".env is missing"];
    }
    throw error;
  }
  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new Error(".env must be a regular file");
    }
    return updateOpenEnvFile(updates, options.checkOnly, descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function updateOpenEnvFile(
  updates: Record<string, string | undefined>,
  checkOnly: boolean,
  descriptor: number,
): string[] {
  const messages: string[] = [];
  const lines = readFileSync(descriptor, "utf8").split(/\r?\n/);
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
    if (!Object.hasOwn(updates, key)) {
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

  if (!checkOnly) {
    // Keep the write on the opened inode even if the pathname is replaced.
    fchmodSync(descriptor, 0o600);
    const content = Buffer.from(nextLines.join("\n"));
    // readFileSync advances the offset; write explicitly from position zero.
    let offset = 0;
    while (offset < content.length) {
      offset += writeSync(
        descriptor,
        content,
        offset,
        content.length - offset,
        offset,
      );
    }
    ftruncateSync(descriptor, content.length);
  }

  return messages;
}
