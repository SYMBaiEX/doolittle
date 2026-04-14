import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import type { AppContext } from "../packages/agent/src/runtime/bootstrap";
import { getAppContext } from "../packages/agent/src/runtime/bootstrap";
import {
  connectLinkedProvider,
  type LinkedProviderName,
  syncProviderSettings,
} from "../packages/agent/src/runtime/chat";

type SmokeContext = AppContext;

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
  nativeReady?: boolean;
  fallbackReady?: boolean;
  activated: boolean;
  connected?: boolean;
  serviceType: string;
  advice?: unknown;
  runtimeCredentials?: unknown;
  liveResponse?: string;
  detail: string;
  error?: string;
}

interface SmokeDependencies {
  getContext: () => Promise<SmokeContext>;
  getSnapshot: () => ReturnType<typeof getLinkedProviderAccountsSnapshot>;
  connect: (
    context: SmokeContext,
    provider: LinkedProviderName,
  ) => ReturnType<typeof connectLinkedProvider>;
  syncSettings: (
    context: SmokeContext,
    settings: ReturnType<SmokeContext["services"]["settings"]["get"]>,
  ) => void;
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

function mapProviderToServiceType(provider: LinkedProviderName): string {
  return provider === "codex" ? "codex" : "claude_code";
}

function buildDependencies(): SmokeDependencies {
  return {
    getContext: async () => getAppContext(),
    getSnapshot: () => getLinkedProviderAccountsSnapshot(),
    connect: (context, provider) => connectLinkedProvider(context, provider),
    syncSettings: syncProviderSettings,
  };
}

function normalizeLiveResponse(text: string | undefined): string | undefined {
  return text?.replace(/\s+/g, " ").trim() || undefined;
}

export async function runSmokeChecks(
  args: SmokeArgs,
  deps: SmokeDependencies = buildDependencies(),
): Promise<SmokeResult[]> {
  const providers: LinkedProviderName[] =
    args.provider === "all" ? ["codex", "claude-code"] : [args.provider];
  const context = await deps.getContext();
  const settingsBefore = context.services.settings.get();
  const results: SmokeResult[] = [];
  const snapshot = deps.getSnapshot();

  try {
    for (const provider of providers) {
      const account =
        provider === "codex" ? snapshot.codex : snapshot.claudeCode;
      const serviceType = mapProviderToServiceType(provider);
      const result: SmokeResult = {
        provider,
        available: account.available,
        reusable: account.reusable,
        nativeReady: account.nativeReady,
        fallbackReady: account.fallbackReady,
        activated: false,
        serviceType,
        detail: account.detail,
      };

      if (!account.reusable) {
        results.push(result);
        continue;
      }

      const connect = await deps.connect(context, provider);
      result.connected = connect.connected;
      result.activated = connect.activated;
      result.advice = connect.advice;

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
    deps.syncSettings(context, context.services.settings.get());
  }

  return results;
}

function printSmokeResults(results: SmokeResult[], args: SmokeArgs): void {
  if (args.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }

  for (const result of results) {
    console.log(
      [
        `[${result.provider}] available=${result.available} reusable=${result.reusable} nativeReady=${result.nativeReady} fallbackReady=${result.fallbackReady} connected=${result.connected} activated=${result.activated}`,
        `service=${result.serviceType}`,
        `detail=${result.detail}`,
        result.advice ? `advice=${JSON.stringify(result.advice)}` : undefined,
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

export async function main(
  argv: string[] = Bun.argv.slice(2),
  deps: SmokeDependencies = buildDependencies(),
): Promise<void> {
  const args = parseArgs(argv);
  const results = await runSmokeChecks(args, deps);
  printSmokeResults(results, args);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
