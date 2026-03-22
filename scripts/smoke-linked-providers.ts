import { getAppContext } from "../packages/agent/src/runtime/bootstrap";
import {
  activateLinkedProvider,
  type LinkedProviderName,
  syncProviderSettings,
} from "../packages/agent/src/runtime/chat";
import { getLinkedProviderAccountsSnapshot } from "../packages/agent/src/runtime/native/account-auth";

interface SmokeArgs {
  provider: LinkedProviderName | "all";
  live: boolean;
  json: boolean;
  prompt: string;
}

interface SmokeResult {
  provider: LinkedProviderName;
  available: boolean;
  reusable: boolean;
  activated: boolean;
  serviceType: string;
  runtimeCredentials?: unknown;
  liveResponse?: string;
  detail: string;
  error?: string;
}

function parseArgs(argv: string[]): SmokeArgs {
  let provider: LinkedProviderName | "all" = "all";
  let live = false;
  let json = false;
  let prompt = "Reply with the exact phrase LINKED_PROVIDER_OK";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--provider") {
      const value = argv[index + 1]?.trim().toLowerCase();
      if (value === "codex" || value === "claude-code") {
        provider = value;
        index += 1;
      }
      continue;
    }
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--prompt") {
      prompt = argv[index + 1]?.trim() || prompt;
      index += 1;
    }
  }

  return {
    provider,
    live,
    json,
    prompt,
  };
}

function normalizeLiveResponse(text: string | undefined): string | undefined {
  return text?.replace(/\s+/g, " ").trim() || undefined;
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));
  const providers: LinkedProviderName[] =
    args.provider === "all" ? ["codex", "claude-code"] : [args.provider];

  const context = await getAppContext();
  const settingsBefore = context.services.settings.get();
  const results: SmokeResult[] = [];
  const snapshot = getLinkedProviderAccountsSnapshot();

  try {
    for (const provider of providers) {
      const account =
        provider === "codex" ? snapshot.codex : snapshot.claudeCode;
      const serviceType = provider === "codex" ? "codex" : "claude_code";
      const result: SmokeResult = {
        provider,
        available: account.available,
        reusable: account.reusable,
        activated: false,
        serviceType,
        detail: account.detail,
      };

      if (!account.reusable) {
        results.push(result);
        continue;
      }

      activateLinkedProvider(context, provider);
      result.activated = true;

      const service = context.runtime.getService(serviceType) as {
        runtimeCredentials?: () => unknown;
        generateText?: (params: {
          prompt: string;
          maxTokens?: number;
        }) => Promise<string>;
      } | null;
      result.runtimeCredentials = service?.runtimeCredentials?.();

      if (args.live) {
        const response = await service?.generateText?.({
          prompt: args.prompt,
          maxTokens: 120,
        });
        result.liveResponse = normalizeLiveResponse(response);
      }

      results.push(result);
    }
  } finally {
    context.services.settings.set(
      "model.provider",
      settingsBefore.model.provider,
    );
    context.services.settings.set("model.model", settingsBefore.model.model);
    context.services.settings.set(
      "model.baseUrl",
      settingsBefore.model.baseUrl,
    );
    context.services.settings.set(
      "model.temperature",
      settingsBefore.model.temperature,
    );
    context.services.settings.set(
      "model.maxTokens",
      settingsBefore.model.maxTokens,
    );
    syncProviderSettings(context, context.services.settings.get());
  }

  if (args.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }

  for (const result of results) {
    console.log(
      [
        `[${result.provider}] available=${result.available} reusable=${result.reusable} activated=${result.activated}`,
        `service=${result.serviceType}`,
        `detail=${result.detail}`,
        result.runtimeCredentials
          ? `runtime=${JSON.stringify(result.runtimeCredentials)}`
          : "runtime=missing",
        result.liveResponse ? `live=${result.liveResponse}` : undefined,
        result.error ? `error=${result.error}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    console.log("");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
