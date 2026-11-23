import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { LoggerService } from "../../packages/agent/src/services/logger-service";

function reference(contents: string, limit: number) {
  const occurrences = new Map<string, number>();
  return contents
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-Math.max(1, limit))
    .reverse()
    .flatMap((line) => {
      try {
        const record = JSON.parse(line);
        if (!record || typeof record.message !== "string") return [];
        if (record.id) return [record];
        const digest = createHash("sha256").update(line).digest("hex");
        const occurrence = occurrences.get(digest) ?? 0;
        occurrences.set(digest, occurrence + 1);
        return [{ ...record, id: `legacy-${digest}-${occurrence}` }];
      } catch {
        return [];
      }
    })
    .reverse();
}

const row = JSON.stringify({ message: "legacy é😀", level: "info" });
const boundaryFixture = `${row}\n${JSON.stringify({ id: "boundary", message: `😀${"x".repeat(65531)}` })}\n`;
const fixtures = [
  "",
  "\n \t\r\n",
  row,
  `${row}\n`,
  ` \n  ${row}\n\n${row}\n \t\n${row}  \n \t`,
  `${row}\nmalformed\n{}\nnull\n${row}\n{"message":`,
  `${row}\r\n${row}\r\n`,
  `${row}\n${JSON.stringify({ message: "x".repeat(140000) })}\n${row}`,
  boundaryFixture,
  `${row}\n${" \n".repeat(40000)}${row}\n`,
];

it.each(fixtures.map((contents, index) => ({ contents, index })))(
  "matches whole-file tail semantics for fixture $index",
  ({ contents }) => {
    const dir = mkdtempSync(join(tmpdir(), "logger-tail-"));
    try {
      const logger = new LoggerService(dir, {
        eventLogPath: join(dir, "events.jsonl"),
      });
      writeFileSync(logger.getEventLogPath(), contents);
      for (const limit of [0, -2, 1, 2, 3, 100, 1.5, Number.NaN, Infinity]) {
        expect(logger.list(limit)).toEqual(reference(contents, limit));
      }
      expect(logger.list()).toEqual(reference(contents, 100));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it("returns no records for a missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "logger-tail-"));
  try {
    expect(new LoggerService(dir).list(1)).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
