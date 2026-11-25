// @vitest-environment jsdom

import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

import { BotCreationDialog } from "../../apps/desktop/src/renderer/bots/BotCreationDialog";
import { TeamManagementPanel } from "../../apps/desktop/src/renderer/bots/TeamManagementPanel";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import { desktopQueryClient } from "../../apps/desktop/src/renderer/lib";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { element: HTMLDivElement; root: Root }[] = [];

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.element.remove();
  }
  desktopQueryClient.clear();
  vi.mocked(desktopRequest).mockReset();
});

function mount() {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const entry = { element, root };
  mounted.push(entry);
  return entry;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (entry) => entry.textContent === label,
  );
}

function botFixture(name: string, persona = "Fixture persona"): BotSummary {
  return {
    id: "bot-1",
    agentId: "agent-1",
    name,
    persona,
    model: { provider: "offline", model: "offline-model" },
    permissions: {
      connectionIds: [],
      toolIds: [],
      workspacePaths: [],
      allowMutation: true,
      allowDelegation: false,
    },
    workspacePath: "/fixture/private",
    isDefault: false,
    state: "ready",
    activeRunCount: 0,
    createdAt: "",
    updatedAt: "",
  };
}

function expectWrappingText(element: Element | null | undefined) {
  expect(element).toBeTruthy();
  expect(element?.classList.contains("min-w-0")).toBe(true);
  expect(element?.classList.contains("[overflow-wrap:anywhere]")).toBe(true);
}

it("keeps long account labels and review values inside the bot dialog", async () => {
  const longToken = "unbroken".repeat(24);
  const bot = botFixture(longToken, `${longToken}\n${longToken}`);
  const accountLabel = `account-${longToken}@example.com`;
  vi.mocked(desktopRequest).mockImplementation(async (path) => {
    if (path === "/runtime/account-pool") {
      return {
        bridgeInstalled: true,
        providers: {
          "openai-api": {
            strategy: "round-robin",
            accounts: [
              {
                providerId: "openai-api",
                accountId: "account-1",
                label: accountLabel,
                source: "api-key",
                enabled: true,
                priority: 0,
                createdAt: 0,
                health: "ready",
              },
            ],
          },
        },
      };
    }
    if (path.startsWith("/runtime/models")) return { providers: [] };
    throw new Error(`Unexpected request: ${path}`);
  });
  const { element, root } = mount();
  act(() =>
    root.render(
      <BotCreationDialog
        editingBot={bot}
        onClose={() => {}}
        onCreated={() => {}}
        returnFocusTarget={null}
        runtime={null}
        workspacePath="/fixture/private"
      />,
    ),
  );
  await flush();

  for (let step = 0; step < 3; step += 1) {
    act(() => button(element, "Continue")?.click());
  }
  const accountRow = [...element.querySelectorAll("label")].find((label) =>
    label.textContent?.includes(accountLabel),
  );
  expectWrappingText(accountRow?.querySelector("span"));

  act(() => button(element, "Continue")?.click());
  const review = element.querySelector("dl");
  expect(review?.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
  const reviewValues = [...(review?.querySelectorAll("dd") ?? [])];
  expectWrappingText(
    reviewValues.find((value) => value.textContent?.includes(longToken)),
  );
  for (const value of reviewValues) expectWrappingText(value);
});

it("keeps long member names inside team rows", async () => {
  const longName = "member".repeat(32);
  const bot = botFixture(longName);
  vi.mocked(desktopRequest).mockImplementation(async (path) => {
    if (path === "/bots") {
      return { version: 1, defaultBotId: bot.id, bots: [bot] };
    }
    if (path === "/bots/teams") return { version: 1, revision: 1, teams: [] };
    throw new Error(`Unexpected request: ${path}`);
  });
  const { element, root } = mount();
  act(() => root.render(<TeamManagementPanel active />));
  await flush();

  const create = button(element, "Create team");
  expect(create?.disabled).toBe(false);
  act(() => create?.click());
  const memberRow = [...element.querySelectorAll("label")].find((label) =>
    label.textContent?.includes(longName),
  );
  expectWrappingText(memberRow?.querySelector("span"));
});
