import { describe, expect, it } from "vitest";
import { HEADLESS_EVAL_SUITES } from "./cases";

const check = HEADLESS_EVAL_SUITES["headless-workflows-v2"]?.tasks.find(
  (task) => task.id === "research-official-source-v2",
)?.checks[0];

function evaluate(response: string): boolean {
  if (!check) throw new Error("Research citation check is missing");
  return check.evaluate({ response } as Parameters<typeof check.evaluate>[0]);
}

describe("official model documentation citation check", () => {
  it("accepts the exact official HTTPS URL with medium evidence", () => {
    expect(
      evaluate(
        "Medium: https://developers.openai.com/api/docs/models/gpt-6-luna.",
      ),
    ).toBe(true);
    expect(
      evaluate(
        "Medium: [official docs](https://developers.openai.com/api/docs/models/gpt-6-luna/?ref=docs#reasoning)",
      ),
    ).toBe(true);
    expect(
      evaluate(
        "Medium: https://developers.openai.com:443/api/docs/models/gpt-6-luna",
      ),
    ).toBe(true);
  });

  it("rejects lookalike hosts, embedded paths, and path suffixes", () => {
    expect(
      evaluate(
        "medium https://evil.example/developers.openai.com/api/docs/models/gpt-6-luna",
      ),
    ).toBe(false);
    expect(
      evaluate(
        "medium https://developers.openai.com.evil.example/api/docs/models/gpt-6-luna",
      ),
    ).toBe(false);
    expect(
      evaluate(
        "medium https://developers.openai.com/api/docs/models/gpt-6-luna-fake",
      ),
    ).toBe(false);
    expect(
      evaluate(
        "medium https://user:secret@developers.openai.com/api/docs/models/gpt-6-luna",
      ),
    ).toBe(false);
    expect(
      evaluate(
        "medium https://developers.openai.com:444/api/docs/models/gpt-6-luna",
      ),
    ).toBe(false);
  });
});
