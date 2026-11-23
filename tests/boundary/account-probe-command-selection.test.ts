import { resolveLinkedModelProviderId } from "@doolittle/contracts/model-route";
import { expect, it } from "vitest";

it("does not accept removed provider aliases for account activation", () => {
  for (const alias of ["devin", "swe", "windsurf"]) {
    expect(resolveLinkedModelProviderId(alias)).toBeUndefined();
  }
  expect(resolveLinkedModelProviderId("codex")).toBe("codex");
});
