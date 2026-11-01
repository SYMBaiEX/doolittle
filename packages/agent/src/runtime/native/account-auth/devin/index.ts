import {
  buildReusableProviderStatus,
  buildUnavailableProviderStatus,
} from "../account-auth-helpers";
import { commandExists, readCommandText } from "../shared";
import type {
  LinkedDevinCredentials,
  LinkedProviderAccountStatus,
} from "../types";

export const DEVIN_LOGIN_COMMAND = "devin auth login";
export const DEFAULT_DEVIN_COMMAND = "devin";
export const DEFAULT_DEVIN_MODEL = "swe-1-6-fast";

function resolveDevinModel(): string {
  return process.env.DEVIN_MODEL?.trim() || DEFAULT_DEVIN_MODEL;
}

function parseAuthMethod(text: string): string | undefined {
  const match = text.match(/logged in via\s+([^\n.]+)/iu);
  return match?.[1]?.trim().toLowerCase();
}

function parseAccountLabel(text: string): string | undefined {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0];
  if (email) {
    return email;
  }
  const user = text.match(/user(?: id)?:\s*([^\n]+)/iu)?.[1]?.trim();
  return user || undefined;
}

export function getDevinCliAuthStatus(homePath?: string): {
  available: boolean;
  loggedIn: boolean;
  source?: string;
  detail?: string;
  authMethod?: string;
  accountLabel?: string;
} {
  const command = DEFAULT_DEVIN_COMMAND;
  if (!commandExists(command)) {
    return {
      available: false,
      loggedIn: false,
    };
  }

  const text = readCommandText("devin", ["auth", "status"], homePath);
  const loggedIn = /logged in/i.test(text) && !/not logged in/i.test(text);
  return {
    available: true,
    loggedIn,
    source: "devin auth status",
    authMethod: parseAuthMethod(text),
    accountLabel: parseAccountLabel(text),
    detail:
      text ||
      (loggedIn
        ? "Devin CLI reports an active login."
        : "Devin CLI is installed but not logged in."),
  };
}

export function getDevinAccountStatus(
  homePath?: string,
): LinkedProviderAccountStatus {
  const command = DEFAULT_DEVIN_COMMAND;
  const cliStatus = getDevinCliAuthStatus(homePath);
  if (cliStatus.loggedIn) {
    return buildReusableProviderStatus({
      provider: "devin",
      source: cliStatus.source,
      authMode: cliStatus.authMethod || "cli",
      accountLabel: cliStatus.accountLabel,
      loginCommand: DEVIN_LOGIN_COMMAND,
      detail:
        "Devin CLI is signed in and ready for Doolittle SWE model execution.",
    });
  }

  return buildUnavailableProviderStatus({
    provider: "devin",
    available: cliStatus.available,
    reusable: false,
    source: cliStatus.source,
    authMode: cliStatus.authMethod,
    accountLabel: cliStatus.accountLabel,
    loginCommand: DEVIN_LOGIN_COMMAND,
    detail: cliStatus.available
      ? "Devin CLI is installed, but no active login was detected. Run `devin auth login`."
      : `Devin CLI command \`${command}\` was not found. Install Devin for Terminal, then run \`devin auth login\`.`,
  });
}

export function getLinkedDevinCredentials(
  homePath?: string,
): LinkedDevinCredentials | undefined {
  const status = getDevinCliAuthStatus(homePath);
  if (!status.loggedIn) {
    return undefined;
  }
  return {
    command: DEFAULT_DEVIN_COMMAND,
    model: resolveDevinModel(),
    authMode: status.authMethod || "cli",
    accountLabel: status.accountLabel,
    source: status.source,
  };
}
