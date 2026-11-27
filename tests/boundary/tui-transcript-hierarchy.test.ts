import { expect, it } from "vitest";
import {
  type ResponseTranscriptEntry,
  renderPlainTranscript,
  renderResponseTranscript,
} from "../../apps/cli/src/cli/transcript-renderer/index";

function entry(
  kind: ResponseTranscriptEntry["kind"],
  label: string,
  body: string,
): ResponseTranscriptEntry {
  return { label, body, at: "12:00:00", kind };
}

it("puts authorship first and leaves the timestamp as trailing metadata", () => {
  const assistant = entry("assistant", "Doolittle", "reply");
  const blessed = renderResponseTranscript([assistant]);
  const plain = renderPlainTranscript([assistant]).split("\n")[0];

  expect(blessed).toMatch(/^\{cyan-fg\}<> Agent\{\/\} Doolittle/);
  expect(blessed.indexOf("Doolittle")).toBeLessThan(
    blessed.indexOf("12:00:00"),
  );
  expect(plain).toMatch(/^<> Agent Doolittle/);
  expect(plain).toMatch(/12:00:00$/);
});

it("groups a response with its turn and indents it under the author gutter", () => {
  const transcript = renderResponseTranscript([
    entry("user", "You", "first prompt"),
    entry("assistant", "Doolittle", "first reply"),
    entry("user", "You", "second prompt"),
  ]);

  const firstTurn = transcript.slice(
    transcript.indexOf("first prompt"),
    transcript.indexOf("first reply"),
  );
  expect(firstTurn).not.toContain("────────────────────────────────");
  expect(transcript).toContain("{cyan-fg}│{/} first reply");
  expect(transcript.match(/────────────/g)).toHaveLength(1);
});
