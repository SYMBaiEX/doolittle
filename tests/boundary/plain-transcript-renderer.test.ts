import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { afterEach, expect, it } from "vitest";
import { createPlainEntryWriter } from "../../apps/cli/src/cli/plain-loop/render";
import {
  type ResponseTranscriptEntry,
  renderPlainEntry,
  renderPlainTranscript,
} from "../../apps/cli/src/cli/transcript-renderer/index";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function entry(): ResponseTranscriptEntry {
  return {
    label: "Coding assistant",
    body: "first line\nsecond line",
    at: "08:00",
    elapsed: "2s",
    kind: "assistant",
    toolTrace: ["workspace:search finished"],
  };
}

it("uses the same entry projection for interactive plain output and export", () => {
  const interactive = stripVTControlCharacters(renderPlainEntry(entry()));
  expect(renderPlainTranscript([entry()])).toBe(interactive);
});

it("does not bypass the plain transcript renderer in noninteractive output", () => {
  const dir = mkdtempSync(join(tmpdir(), "plain-renderer-"));
  dirs.push(dir);
  let written = "";
  const writer = createPlainEntryWriter({
    context: {
      config: { dataDir: dir },
    } as unknown as AppContext,
    interactiveShell: false,
    output: {
      write(chunk: string) {
        written += chunk;
        return true;
      },
    } as NodeJS.WriteStream,
    responseHistory: [],
  });

  writer.pushPlainEntry(entry());

  expect(stripVTControlCharacters(written).trim()).toBe(
    renderPlainTranscript([entry()]),
  );
});
