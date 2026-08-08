import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSkillsDir } from "@elizaos/skills/index";
import { afterEach, describe, expect, it } from "vitest";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";
import {
  bootstrapRuntimeEnvironment,
  buildPluginSettings,
  ensureSecretSalt,
} from "./";

const originalEnv = {
  DOOLITTLE_EMBEDDING_PROVIDER: process.env.DOOLITTLE_EMBEDDING_PROVIDER,
  E2B_API_KEY: process.env.E2B_API_KEY,
  E2B_MODE: process.env.E2B_MODE,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  LOG_LEVEL: process.env.LOG_LEVEL,
  DEFAULT_LOG_LEVEL: process.env.DEFAULT_LOG_LEVEL,
  NODE_ENV: process.env.NODE_ENV,
  SECRET_SALT: process.env.SECRET_SALT,
  ENCRYPTION_SALT: process.env.ENCRYPTION_SALT,
  ELIZA_SECRET_SALT: process.env.ELIZA_SECRET_SALT,
  PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR,
};

function restoreEnv(
  name: keyof typeof originalEnv,
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    restoreEnv(name as keyof typeof originalEnv, value);
  }
});

function makeConfig(dataDir: string): EnvConfig {
  return { dataDir } as EnvConfig;
}

function makeRuntimeSettings() {
  return {
    agent: {
      maxIterations: 5,
      runDepth: "deep",
      toolProgressMode: "verbose",
    },
    model: {
      model: "gpt-5",
      provider: "openai",
      reasoningEffort: "medium",
    },
  } as ReturnType<AppServices["settings"]["get"]>;
}

describe("bootstrap environment", () => {
  it("defaults runtime env vars and generates a secret salt", () => {
    const root = join(tmpdir(), `doolittle-bootstrap-${Date.now()}`);
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { recursive: true });
    delete process.env.LOG_LEVEL;
    delete process.env.DEFAULT_LOG_LEVEL;
    delete process.env.SECRET_SALT;
    delete process.env.ENCRYPTION_SALT;
    delete process.env.ELIZA_SECRET_SALT;
    delete process.env.PGLITE_DATA_DIR;

    bootstrapRuntimeEnvironment(makeConfig(root));

    expect(process.env.LOG_LEVEL ?? "").toBe("error");
    expect(process.env.DEFAULT_LOG_LEVEL ?? "").toBe("error");
    expect(process.env.PGLITE_DATA_DIR ?? "").toBe(join(root, "pglite"));
    expect(readFileSync(join(root, "secret-salt"), "utf8").trim()).toBe(
      process.env.SECRET_SALT ?? "",
    );
    expect(process.env.ENCRYPTION_SALT).toBe(process.env.SECRET_SALT);

    rmSync(root, { force: true, recursive: true });
  });

  it("keeps pglite preparation aligned with an explicit env override", () => {
    const root = join(tmpdir(), `doolittle-bootstrap-${Date.now()}-pglite`);
    const overriddenPgliteDir = join(root, "custom-pglite");
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { recursive: true });
    process.env.PGLITE_DATA_DIR = overriddenPgliteDir;

    bootstrapRuntimeEnvironment(makeConfig(root));

    expect(process.env.PGLITE_DATA_DIR).toBe(overriddenPgliteDir);
    expect(existsSync(overriddenPgliteDir)).toBe(true);

    const settings = buildPluginSettings(
      {
        dataDir: root,
      } as EnvConfig,
      {
        nativeRegistry: {},
      } as unknown as AppServices,
      makeRuntimeSettings(),
    );

    expect(settings.PGLITE_DATA_DIR).toBe(overriddenPgliteDir);

    rmSync(root, { force: true, recursive: true });
  });

  it("reuses an existing secret salt file", () => {
    const root = join(tmpdir(), `doolittle-bootstrap-${Date.now()}-salt`);
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "secret-salt"), "stable-salt\n", "utf8");

    expect(ensureSecretSalt(makeConfig(root))).toBe("stable-salt");

    rmSync(root, { force: true, recursive: true });
  });

  it("prefers a provided secret salt from the environment", () => {
    const root = join(tmpdir(), `doolittle-bootstrap-${Date.now()}-provided`);
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { recursive: true });
    process.env.SECRET_SALT = "provided-salt";

    expect(ensureSecretSalt(makeConfig(root))).toBe("provided-salt");
    expect(() => readFileSync(join(root, "secret-salt"), "utf8")).toThrow();

    rmSync(root, { force: true, recursive: true });
  });

  it("serializes plugin settings from config, runtime settings, and ambient env", () => {
    const root = join(tmpdir(), `doolittle-bootstrap-${Date.now()}-settings`);
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { recursive: true });
    process.env.SECRET_SALT = "runtime-secret";
    process.env.DOOLITTLE_EMBEDDING_PROVIDER = "elizacloud";
    process.env.E2B_MODE = "cloud";
    process.env.E2B_API_KEY = "e2b-key";
    process.env.GITHUB_TOKEN = "github-token";
    process.env.NODE_ENV = "test";

    const settings = buildPluginSettings(
      {
        dataDir: root,
        skillsDir: "/workspace/packages/skills",
        elizaCloudBaseUrl: "https://cloud.example",
        elizaCloudSmallModel: "small-cloud",
        elizaCloudLargeModel: "large-cloud",
        elizaCloudEmbeddingModel: "embed-cloud",
        ollamaApiEndpoint: "http://localhost:11434/api",
        ollamaSmallModel: "granite4.1:3b",
        ollamaLargeModel: "granite4.1:3b",
        ollamaEmbeddingModel: "nomic-embed-text:latest",
        openAiBaseUrl: "https://openai.example",
        openAiApiKey: "openai-key",
        openAiImageModel: "gpt-image-1",
        anthropicApiKey: "anthropic-key",
        anthropicBaseUrl: "https://anthropic.example",
        anthropicSmallModel: "claude-small",
        anthropicLargeModel: "claude-large",
        telegramBotToken: "telegram-token",
        telegramApiRoot: "https://telegram.example",
        telegramAllowedChats: "123,456",
      } as EnvConfig,
      {
        nativeRegistry: { browser: { enabled: true } },
      } as unknown as AppServices,
      makeRuntimeSettings(),
    );

    expect(settings.DOOLITTLE_EMBEDDING_PROVIDER).toBe("elizacloud");
    expect(settings.WORKSPACE_SKILLS_DIR).toBe("/workspace/packages/skills");
    expect(settings.SKILLS_DIR).toContain(".elizaos/skills");
    expect(settings.BUNDLED_SKILLS_DIRS).toBe(getSkillsDir());
    expect(settings.SKILLS_AUTO_LOAD).toBe("true");
    expect(settings.SKILLS_SYNC_CATALOG_ON_START).toBe("false");
    expect(settings.OLLAMA_API_ENDPOINT).toBe("http://localhost:11434/api");
    expect(settings.OLLAMA_SMALL_MODEL).toBe("granite4.1:3b");
    expect(settings.OLLAMA_MEDIUM_MODEL).toBe("granite4.1:3b");
    expect(settings.OLLAMA_LARGE_MODEL).toBe("granite4.1:3b");
    expect(settings.OLLAMA_RESPONSE_HANDLER_MODEL).toBe("granite4.1:3b");
    expect(settings.OLLAMA_ACTION_PLANNER_MODEL).toBe("granite4.1:3b");
    expect(settings.OLLAMA_EMBEDDING_MODEL).toBe("nomic-embed-text:latest");
    expect(settings.ELIZAOS_CLOUD_EMBEDDING_MODEL).toBe("embed-cloud");
    expect(settings.OPENAI_API_KEY).toBe("openai-key");
    expect(settings.OPENAI_IMAGE_MODEL).toBe("gpt-image-1");
    expect(settings.OPENAI_REASONING_EFFORT).toBe("medium");
    expect(settings.ANTHROPIC_API_KEY).toBe("anthropic-key");
    expect(settings.ANTHROPIC_BASE_URL).toBe("https://anthropic.example");
    expect(settings.E2B_MODE).toBe("cloud");
    expect(settings.E2B_API_KEY).toBe("e2b-key");
    expect(settings.GITHUB_TOKEN).toBe("github-token");
    expect(settings.NODE_ENV).toBe("test");
    expect(settings.SECRET_SALT).toBe("runtime-secret");
    expect(settings.ENCRYPTION_SALT).toBe("runtime-secret");
    expect(settings.PGLITE_DATA_DIR).toBe(join(root, "pglite"));
    expect(settings.DOOLITTLE_RUN_DEPTH).toBe("deep");
    expect(settings.DOOLITTLE_TOOL_PROGRESS).toBe("verbose");
    expect(settings.runtimeSettings).toContain('"provider":"openai"');
    expect(settings.nativeServiceRegistry).toContain('"browser"');
    expect(settings.TELEGRAM_BOT_TOKEN).toBe("telegram-token");
    expect(settings.TELEGRAM_API_ROOT).toBe("https://telegram.example");
    expect(settings.TELEGRAM_ALLOWED_CHATS).toBe("123,456");

    rmSync(root, { force: true, recursive: true });
  });

  it("does not pass non-OpenAI reasoning values to the official OpenAI plugin", () => {
    const settings = buildPluginSettings(
      { dataDir: tmpdir() } as EnvConfig,
      { nativeRegistry: {} } as unknown as AppServices,
      {
        ...makeRuntimeSettings(),
        model: {
          model: "claude-sonnet-5",
          provider: "claude-code",
          reasoningEffort: "xhigh",
        },
      } as ReturnType<AppServices["settings"]["get"]>,
    );

    expect(settings.OPENAI_REASONING_EFFORT).toBeUndefined();
  });

  it("configures the official Codex plugin without projecting subscription tokens as OpenAI API keys", () => {
    const settings = buildPluginSettings(
      {
        dataDir: tmpdir(),
        useLinkedCodexAuth: true,
        openAiApiKey: "",
      } as EnvConfig,
      { nativeRegistry: {} } as unknown as AppServices,
      {
        ...makeRuntimeSettings(),
        model: {
          model: "gpt-5.4",
          provider: "codex",
          baseUrl: "https://ignored.example",
        },
      } as ReturnType<AppServices["settings"]["get"]>,
    );

    expect(settings.CODEX_MODEL).toBe("gpt-5.4");
    expect(settings.CODEX_BASE_URL).toBe(
      "https://chatgpt.com/backend-api/codex",
    );
    expect(settings.OPENAI_API_KEY).toBeUndefined();
  });

  it("supports explicit dependency injection for linked credentials and ambient env", () => {
    const root = join(tmpdir(), `doolittle-bootstrap-${Date.now()}-linked`);
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { recursive: true });

    const settings = buildPluginSettings(
      {
        dataDir: root,
        elizaCloudBaseUrl: "https://cloud.example",
        elizaCloudSmallModel: "small-cloud",
        elizaCloudLargeModel: "large-cloud",
        elizaCloudEmbeddingModel: "embed-cloud",
        ollamaApiEndpoint: "http://localhost:11434/api",
        ollamaSmallModel: "granite4.1:3b",
        ollamaLargeModel: "granite4.1:3b",
        ollamaEmbeddingModel: "nomic-embed-text:latest",
        openAiBaseUrl: "https://openai.example",
        anthropicSmallModel: "claude-small",
        anthropicLargeModel: "claude-large",
        useLinkedCodexAuth: true,
        useLinkedClaudeCodeAuth: true,
      } as EnvConfig,
      {
        nativeRegistry: {},
      } as unknown as AppServices,
      {
        ...makeRuntimeSettings(),
        model: {
          model: "claude-sonnet",
          provider: "claude-code",
        },
      } as ReturnType<AppServices["settings"]["get"]>,
      {
        env: {
          DOOLITTLE_EMBEDDING_PROVIDER: "local",
          NODE_ENV: "production",
        },
        secretSalt: "injected-salt",
        pgliteDataDir: join(root, "pglite-explicit"),
        linkedCredentials: {
          claudeCode: {
            accessToken: "claude-linked-token",
          } as never,
        },
      },
    );

    expect(settings.ANTHROPIC_API_KEY).toBe("claude-linked-token");
    expect(settings.SECRET_SALT).toBe("injected-salt");
    expect(settings.ENCRYPTION_SALT).toBe("injected-salt");
    expect(settings.PGLITE_DATA_DIR).toBe(join(root, "pglite-explicit"));
    expect(settings.NODE_ENV).toBe("production");

    rmSync(root, { force: true, recursive: true });
  });

  it("does not expose a saved ElizaCloud key to local Devin runtime settings", () => {
    const root = join(tmpdir(), `doolittle-bootstrap-${Date.now()}-devin`);
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { recursive: true });

    const settings = buildPluginSettings(
      {
        dataDir: root,
        elizaCloudEnabled: false,
        elizaCloudApiKey: "saved-cloud-key",
        elizaCloudBaseUrl: "https://cloud.example",
        elizaCloudSmallModel: "small-cloud",
        elizaCloudLargeModel: "large-cloud",
        elizaCloudEmbeddingModel: "embed-cloud",
        ollamaApiEndpoint: "http://localhost:11434/api",
        ollamaSmallModel: "granite4.1:3b",
        ollamaLargeModel: "granite4.1:3b",
        ollamaEmbeddingModel: "nomic-embed-text:latest",
        openAiBaseUrl: "https://openai.example",
        anthropicSmallModel: "claude-small",
        anthropicLargeModel: "claude-large",
        useLinkedDevinAuth: true,
        devinCliCommand: "devin",
        devinModel: "swe-1-6-fast",
        devinTimeoutMs: 120_000,
      } as EnvConfig,
      {
        nativeRegistry: {},
      } as unknown as AppServices,
      {
        ...makeRuntimeSettings(),
        model: {
          model: "swe-1-6-fast",
          provider: "devin",
        },
      } as ReturnType<AppServices["settings"]["get"]>,
      {
        env: {
          DOOLITTLE_EMBEDDING_PROVIDER: "local",
        },
        secretSalt: "injected-salt",
      },
    );

    expect(settings.ELIZAOS_CLOUD_ENABLED).toBe("false");
    expect(settings.ELIZAOS_CLOUD_API_KEY).toBeUndefined();

    rmSync(root, { force: true, recursive: true });
  });
});
