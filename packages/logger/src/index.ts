export { createLoggerPreset } from "./factory";
export { isLevelEnabled, LOG_LEVEL_WEIGHT, normalizeLogLevel } from "./levels";
export {
  createLogger,
  createNoopLogger,
  DOCTOR_LOGGER_CODENAME,
  DOCTOR_LOGGER_CODENAME as LOGGER_CODENAME,
} from "./logger";
export {
  formatLoggerError,
  formatLoggerError as formatErrorLike,
  normalizeLogFields,
} from "./serialize";
export {
  createCrashFileTransport,
  createJsonlFileTransport,
  createJsonlFileTransport as createJsonLinesFileTransport,
  createMemoryTransport,
  createPrettyConsoleTransport,
  readJsonlTail,
} from "./transports";
export type {
  CrashFileTransportOptions,
  JsonlFileTransportOptions,
  LogEntryOptions,
  Logger,
  LoggerOptions,
  LoggerPreset,
  LoggerRecord as LogRecord,
  LoggerRecord,
  LoggerRedactionOptions,
  LoggerSerializationOptions,
  LoggerSerializerMap,
  LoggerTransport,
  LogKind,
  LogLevel,
  MemoryTransport,
  MemoryTransportOptions,
  PrettyConsoleTransportOptions,
} from "./types";
