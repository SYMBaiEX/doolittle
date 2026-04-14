import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { platform } from "node:os";
import { normalizeCloudSiteUrl } from "@elizaos/autonomous/cloud/base-url";
import { checkCloudAvailability } from "@elizaos/autonomous/runtime/cloud-onboarding";
import type { BootstrapWizardContext } from "../bootstrap-context";
import {
  restoreWizardScreen,
  suspendWizardScreen,
} from "../wizard-screen/lifecycle";

interface ElizaCloudLoginSession {
  sessionId: string;
  browserUrl: string;
}

interface ElizaCloudLoginPollResult {
  status: string;
  apiKey?: string;
}

async function tryOpenBrowser(url: string): Promise<boolean> {
  const isWindows = platform() === "win32";
  const isMac = platform() === "darwin";
  const bin = isMac ? "open" : isWindows ? "cmd" : "xdg-open";
  const args = isWindows ? ["/c", "start", "", url] : [url];

  return await new Promise<boolean>((resolve) => {
    try {
      const child = spawn(bin, args, {
        stdio: "ignore",
        env: process.env,
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => resolve(true));
      child.unref();
    } catch {
      resolve(false);
    }
  });
}

async function createSession(baseUrl: string): Promise<ElizaCloudLoginSession> {
  const siteBase = normalizeCloudSiteUrl(baseUrl);
  const sessionId = randomUUID();
  const response = await fetch(`${siteBase}/api/auth/cli-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to create auth session (HTTP ${response.status}): ${body || "empty response"}`,
    );
  }

  return {
    sessionId,
    browserUrl: `${siteBase}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,
  };
}

async function pollSession(
  baseUrl: string,
  sessionId: string,
): Promise<ElizaCloudLoginPollResult> {
  const siteBase = normalizeCloudSiteUrl(baseUrl);
  const response = await fetch(
    `${siteBase}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
    {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (response.status === 404) {
    throw new Error("Auth session expired or not found. Please try again.");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Cloud login polling failed (HTTP ${response.status}): ${body || "empty response"}`,
    );
  }

  return (await response.json()) as ElizaCloudLoginPollResult;
}

export async function runElizaCloudLoginFlow(
  context: BootstrapWizardContext,
  label: string,
  baseUrl = "https://www.elizacloud.ai",
): Promise<string | undefined> {
  const snapshot = suspendWizardScreen(context);

  try {
    context.section("Binding", label);
    const availability = await checkCloudAvailability(baseUrl);
    if (availability) {
      const normalizedAvailability = availability.toLowerCase();
      const authGatedAvailability =
        normalizedAvailability.includes("http 401") ||
        normalizedAvailability.includes("http 403");
      if (authGatedAvailability) {
        context.warn(
          "Eliza Cloud availability probing is auth-gated right now, so I am continuing directly to the login flow instead of treating that probe as a blocker.",
        );
      } else {
        context.warn(availability);
        return undefined;
      }
    }

    let announcedBrowser = false;
    let lastStatus = "";
    const session = await createSession(baseUrl);

    if (!announcedBrowser) {
      context.info("Trying to open your browser for Eliza Cloud login.");
      context.info(
        `If it does not appear, open this URL manually: ${session.browserUrl}`,
      );
      context.info(
        "I will keep waiting here while the Eliza Cloud login completes.",
      );
      announcedBrowser = true;
      void tryOpenBrowser(session.browserUrl).then((opened) => {
        if (!opened) {
          context.warn(
            "I could not confirm an automatic browser launch. Use the URL above to continue the Cloud login manually.",
          );
        }
      });
    }

    const deadline = Date.now() + 300_000;
    let apiKey: string | undefined;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const poll = await pollSession(baseUrl, session.sessionId);
      if (poll.status && poll.status !== lastStatus) {
        context.info(`Eliza Cloud auth: ${poll.status}`);
        lastStatus = poll.status;
      }
      if (poll.status === "authenticated" && poll.apiKey) {
        apiKey = poll.apiKey;
        break;
      }
    }

    if (!apiKey) {
      throw new Error(
        "Cloud login timed out. The browser login was not completed within 300 seconds.",
      );
    }

    context.info(`${label} completed.`);
    return apiKey;
  } catch (error) {
    context.warn(
      `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  } finally {
    restoreWizardScreen(context, snapshot);
  }
}
