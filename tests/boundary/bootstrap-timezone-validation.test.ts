import { expect, it } from "vitest";
import { createHeadlessAnswers } from "../../scripts/bootstrap/answers/headless";
import {
  buildBootstrapEnvUpdates,
  isValidIanaTimezone,
} from "../../scripts/bootstrap/persistence/environment";

it("accepts real IANA timezone names", () => {
  expect(isValidIanaTimezone("America/Chicago")).toBe(true);
  expect(isValidIanaTimezone("Europe/Berlin")).toBe(true);
  expect(isValidIanaTimezone("UTC")).toBe(true);
});

it("rejects malformed timezone text", () => {
  expect(isValidIanaTimezone("not/a-real-timezone")).toBe(false);
  expect(isValidIanaTimezone("America Chicago")).toBe(false);
  expect(isValidIanaTimezone("")).toBe(false);
});

it("refuses to project an invalid timezone into environment persistence", () => {
  const answers = {
    ...createHeadlessAnswers(new Map()),
    timezone: "not/a-real-timezone",
  };

  expect(() => buildBootstrapEnvUpdates(answers)).toThrow(
    /valid IANA timezone/,
  );
});
