import { afterEach, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  commandExists: vi.fn(() => true),
  readCommandText: vi.fn(() => "Logged in via browser."),
}));
vi.mock(
  "../../packages/agent/src/runtime/native/account-auth/shared",
  () => probes,
);

import {
  getDevinAccountStatus,
  getDevinCliAuthStatus,
  getLinkedDevinCredentials,
} from "../../packages/agent/src/runtime/native/account-auth/devin";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("never executes an environment-selected program during automatic account discovery", () => {
  vi.stubEnv("DEVIN_CLI_COMMAND", "/untrusted/workspace/status-hook");
  expect(getDevinCliAuthStatus("/selected/home")).toMatchObject({
    available: false,
    loggedIn: false,
  });
  expect(getDevinAccountStatus("/selected/home")).toMatchObject({
    nativeReady: false,
    reusable: false,
  });
  expect(getDevinAccountStatus("/selected/home").detail).toContain(
    "Remove DEVIN_CLI_COMMAND",
  );
  expect(getLinkedDevinCredentials("/selected/home")).toBeUndefined();
  expect(probes.commandExists).not.toHaveBeenCalled();
  expect(probes.readCommandText).not.toHaveBeenCalled();
});

it("uses the same fixed binary for discovered credentials and status", () => {
  vi.stubEnv("DEVIN_CLI_COMMAND", "devin");
  expect(getDevinCliAuthStatus("/selected/home").loggedIn).toBe(true);
  expect(probes.readCommandText).toHaveBeenCalledExactlyOnceWith(
    "devin",
    ["auth", "status"],
    "/selected/home",
  );
  expect(getLinkedDevinCredentials("/selected/home")?.command).toBe("devin");
});
it("refuses a differing explicit provider command even if the default CLI is signed in", () => {
  vi.stubEnv("DEVIN_CLI_COMMAND", "devin");
  expect(
    getDevinAccountStatus("/selected/home", "/different/devin"),
  ).toMatchObject({ available: false, nativeReady: false, reusable: false });
  expect(probes.readCommandText).not.toHaveBeenCalled();
});
