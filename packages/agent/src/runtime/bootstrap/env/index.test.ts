import { afterEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  ELIZA_SECRET_SALT: process.env.ELIZA_SECRET_SALT,
  PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR,
};

afterEach(() => {
  process.env.DOOLITTLE_EMBEDDING_PROVIDER =
    originalEnv.DOOLITTLE_EMBEDDING_PROVIDER;
  process.env.E2B_API_KEY = originalEnv.E2B_API_KEY;
  process.env.E2B_MODE = originalEnv.E2B_MODE;
  process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
  process.env.LOG_LEVEL = originalEnv.LOG_LEVEL;
  process.env.DEFAULT_LOG_LEVEL = originalEnv.DEFAULT_LOG_LEVEL;
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  process.env.SECRET_SALT = originalEnv.SECRET_SALT;
  process.env.ELIZA_SECRET_SALT = originalEnv.ELIZA_SECRET_SALT;
  process.env.PGLITE_DATA_DIR = originalEnv.PGLITE_DATA_DIR;
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
    delete process.env.ELIZA_SECRET_SALT;
    delete process.env.PGLITE_DATA_DIR;

    bootstrapRuntimeEnvironment(makeConfig(root));

    expect(process.env.LOG_LEVEL ?? "").toBe("error");
    expect(process.env.DEFAULT_LOG_LEVEL ?? "").toBe("error");
    expect(process.env.PGLITE_DATA_DIR ?? "").toBe(join(root, "pglite"));
    expect(readFileSync(join(root, "secret-salt"), "utf8").trim()).toBe(
      process.env.SECRET_SALT ?? "",
    );

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
        elizaCloudBaseUrl: "https://cloud.example",
        elizaCloudSmallModel: "small-cloud",
        elizaCloudLargeModel: "large-cloud",
        elizaCloudEmbeddingModel: "embed-cloud",
        openAiBaseUrl: "https://openai.example",
        openAiApiKey: "openai-key",
        anthropicApiKey: "anthropic-key",
        anthropicBaseUrl: "https://anthropic.example",
        anthropicSmallModel: "claude-small",
        anthropicLargeModel: "claude-large",
        falApiKey: "fal-key",
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
    expect(settings.ELIZAOS_CLOUD_EMBEDDING_MODEL).toBe("embed-cloud");
    expect(settings.OPENAI_API_KEY).toBe("openai-key");
    expect(settings.ANTHROPIC_API_KEY).toBe("anthropic-key");
    expect(settings.ANTHROPIC_BASE_URL).toBe("https://anthropic.example");
    expect(settings.FAL_API_KEY).toBe("fal-key");
    expect(settings.E2B_MODE).toBe("cloud");
    expect(settings.E2B_API_KEY).toBe("e2b-key");
    expect(settings.GITHUB_TOKEN).toBe("github-token");
    expect(settings.NODE_ENV).toBe("test");
    expect(settings.SECRET_SALT).toBe("runtime-secret");
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
    expect(settings.PGLITE_DATA_DIR).toBe(join(root, "pglite-explicit"));
    expect(settings.NODE_ENV).toBe("production");

    rmSync(root, { force: true, recursive: true });
  });
});
