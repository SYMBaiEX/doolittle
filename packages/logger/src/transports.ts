import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { isLevelEnabled } from "./levels";
import type {
  CrashFileTransportOptions,
  JsonlFileTransportOptions,
  LoggerRecord,
  LoggerTransport,
  LogKind,
  MemoryTransport,
  MemoryTransportOptions,
  PrettyConsoleTransportOptions,
} from "./types";

const RESET = "\u001B[0m";
const COLORS = {
  trace: "\u001B[90m",
  debug: "\u001B[36m",
  info: "\u001B[32m",
  warn: "\u001B[33m",
  error: "\u001B[31m",
  fatal: "\u001B[35m",
};

function shouldWriteTransport(
  transport: Pick<LoggerTransport, "minLevel" | "kinds">,
  record: LoggerRecord,
): boolean {
  if (transport.minLevel && !isLevelEnabled(transport.minLevel, record.level)) {
    return false;
  }
  if (transport.kinds?.length && !transport.kinds.includes(record.kind)) {
    return false;
  }
  return true;
}

function formatTags(record: LoggerRecord): string {
  if (!record.tags?.length) {
    return "";
  }
  return ` tags=${record.tags.join(",")}`;
}

export function createJsonlFileTransport(
  options: JsonlFileTransportOptions,
): LoggerTransport {
  let ready = false;
  const transport: LoggerTransport = {
    name: `jsonl:${options.path}`,
    minLevel: options.minLevel,
    kinds: options.kinds ?? ["event"],
    write(record) {
      if (!shouldWriteTransport(transport, record)) {
        return;
      }
      if (!ready) {
        mkdirSync(dirname(options.path), { recursive: true });
        ready = true;
      }
      appendFileSync(options.path, `${JSON.stringify(record)}\n`, "utf8");
    },
  };
  return transport;
}

export function createCrashFileTransport(
  options: CrashFileTransportOptions,
): LoggerTransport {
  let ready = false;
  const transport: LoggerTransport = {
    name: `crash:${options.path}`,
    minLevel: options.minLevel ?? "error",
    kinds: options.kinds ?? ["crash"],
    write(record) {
      if (!shouldWriteTransport(transport, record)) {
        return;
      }
      if (!ready) {
        mkdirSync(dirname(options.path), { recursive: true });
        ready = true;
      }
      const fieldBlock =
        options.includeFields && record.fields
          ? `\nfields: ${JSON.stringify(record.fields, null, 2)}`
          : "";
      const scopeLabel = record.scope ? ` (${record.scope})` : "";
      appendFileSync(
        options.path,
        `[${record.at}] ${record.message}${scopeLabel}\n${record.detail ?? ""}${fieldBlock}\n\n`,
        "utf8",
      );
    },
  };
  return transport;
}

export function createMemoryTransport(
  options: MemoryTransportOptions = {},
): MemoryTransport {
  const records: LoggerRecord[] = [];
  const limit = Math.max(1, options.limit ?? 500);
  const transport: MemoryTransport = {
    name: "memory",
    minLevel: options.minLevel,
    kinds: options.kinds,
    write(record) {
      if (!shouldWriteTransport(transport, record)) {
        return;
      }
      records.push(record);
      if (records.length > limit) {
        records.splice(0, records.length - limit);
      }
    },
    records() {
      return [...records];
    },
    clear() {
      records.length = 0;
    },
  };
  return transport;
}

export function createPrettyConsoleTransport(
  options: PrettyConsoleTransportOptions = {},
): LoggerTransport {
  const stream = options.stream ?? process.stderr;
  const color = options.color ?? Boolean(stream.isTTY);
  const transport: LoggerTransport = {
    name: "pretty-console",
    minLevel: options.minLevel,
    kinds: options.kinds ?? ["event", "crash"],
    write(record) {
      if (!shouldWriteTransport(transport, record)) {
        return;
      }
      const levelLabel = record.level.toUpperCase().padEnd(5);
      const timeLabel = record.at.slice(11, 19);
      const prefix = color
        ? `${COLORS[record.level]}${levelLabel}${RESET}`
        : levelLabel;
      const crashFlag = record.kind === "crash" ? " crash" : "";
      const firstLine =
        `${timeLabel} ${prefix} ${record.scope} ${record.message}${crashFlag}${options.showTags === false ? "" : formatTags(record)}`.trimEnd();
      stream.write(`${firstLine}\n`);
      if (record.detail) {
        stream.write(`  ${record.detail}\n`);
      }
      if (record.fields && Object.keys(record.fields).length) {
        stream.write(`  ${JSON.stringify(record.fields)}\n`);
      }
    },
  };
  return transport;
}

export function readJsonlTail(
  path: string,
  limit = 100,
  kinds?: LogKind[],
): LoggerRecord[] {
  const content = readFileSync(path, "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .flatMap((line) => {
      try {
        const record = JSON.parse(line) as LoggerRecord;
        if (kinds?.length && !kinds.includes(record.kind)) {
          return [];
        }
        return [record];
      } catch {
        return [];
      }
    });
}
