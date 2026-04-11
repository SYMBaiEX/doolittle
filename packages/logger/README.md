# @doolittle/logger

`@doolittle/logger` is the reusable structured logger package for the Doolittle workspace.

- Package name: `@doolittle/logger`
- Internal codename: `Dr. Mochibi`
- Runtime target: Bun-first, plain TypeScript source exports

## Features

- leveled structured logging with `trace` through `fatal`
- scoped child loggers
- bound fields and tags
- structured error capture and crash recording
- multi-transport fanout
- built-in JSONL, crash-file, pretty-console, and memory transports
- field redaction for secrets
- circular-safe serialization with sensible fallbacks
- reusable core suitable for future SDK exposure
- preset/builder ergonomics for reusing logger defaults across modules

## Example

```ts
import {
  DOCTOR_LOGGER_CODENAME,
  createCrashFileTransport,
  createJsonlFileTransport,
  createLogger,
  createPrettyConsoleTransport,
} from "@doolittle/logger";

const logger = createLogger({
  name: "doolittle",
  scope: "doolittle.api",
  minLevel: "info",
  transports: [
    createJsonlFileTransport({ path: "/tmp/doolittle.jsonl" }),
    createCrashFileTransport({ path: "/tmp/doolittle-crash.log" }),
    createPrettyConsoleTransport(),
  ],
});

logger.info("booted", { codename: DOCTOR_LOGGER_CODENAME });
```

## Presets

```ts
import { createLoggerPreset, createMemoryTransport } from "@doolittle/logger";

const memory = createMemoryTransport();
const preset = createLoggerPreset({
  name: "doolittle",
  scope: "doolittle",
  transports: [memory],
  tags: ["workspace"],
});

preset
  .child("worker", { jobId: "42" })
  .withTags("batch")
  .create()
  .info("queued");
```
