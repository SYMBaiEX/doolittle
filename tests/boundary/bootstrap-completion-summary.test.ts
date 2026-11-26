import { expect, it } from "vitest";
import { createHeadlessAnswers } from "../../scripts/bootstrap/answers/headless";
import { summarizeAnswers } from "../../scripts/bootstrap/answers/summary";

it("summarizes the offline provider with its actual offline model route", () => {
  const answers = {
    ...createHeadlessAnswers(new Map()),
    provider: "offline" as const,
  };

  expect(summarizeAnswers(answers)[0]).toBe("mind=offline model=offline");
});
