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
  getDevinCliAuthStatus,
  getLinkedDevinCredentials,
} from "../../packages/agent/src/runtime/native/account-auth/devin";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("never executes an environment-selected program during automatic account discovery", () => {
  vi.stubEnv("DEVIN_CLI_COMMAND", "/untrusted/workspace/status-hook");
  expect(getDevinCliAuthStatus("/selected/home").loggedIn).toBe(true);
  expect(probes.commandExists).toHaveBeenCalledWith("devin");
  expect(probes.readCommandText).toHaveBeenCalledExactlyOnceWith(
    "devin",
    ["auth", "status"],
    "/selected/home",
  );
  expect(getLinkedDevinCredentials("/selected/home")?.command).toBe("devin");
});
