import { describe, expect, it } from "vitest";
import { connectionsResourcePolicy } from "./ConnectionsPage";

describe("connectionsResourcePolicy", () => {
  it("loads chat provider state immediately and defers account pools until opened", () => {
    expect(connectionsResourcePolicy(true, false)).toEqual({
      accounts: true,
      accountPool: false,
    });
    expect(connectionsResourcePolicy(true, true)).toEqual({
      accounts: true,
      accountPool: true,
    });
    expect(connectionsResourcePolicy(false, true)).toEqual({
      accounts: false,
      accountPool: false,
    });
  });
});
