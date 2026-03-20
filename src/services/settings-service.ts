import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExecutionBackendName } from "@/types";

export interface RuntimeSettings {
  model: {
    provider: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
  };
  gateway: {
    sessionTimeoutMinutes: number;
    mirrorResponsesToHistory: boolean;
  };
  execution: {
    backend: ExecutionBackendName;
    dockerImage: string;
    dockerNetwork: string;
    dockerWorkspacePath: string;
    dockerEnvPassthrough: string[];
    commandTimeoutMs?: number;
    healthTimeoutMs?: number;
    containerCpuLimit?: string;
    containerMemoryLimit?: string;
    containerPidsLimit?: number;
    containerReadOnlyRoot?: boolean;
    sshHost: string;
    sshUser: string;
    sshPath: string;
    sshPort: number;
    sshKeyPath: string;
    sshStrictHostKeyChecking: boolean;
  };
  mcp: {
    serverCommand: string;
    timeoutMs: number;
  };
}

export class SettingsService {
  private readonly filePath: string;

  constructor(baseDir: string, defaults: RuntimeSettings) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "settings.json");
    if (!existsSync(this.filePath)) {
      this.write(defaults);
    }
  }

  get(): RuntimeSettings {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as RuntimeSettings & {
      execution?: Partial<RuntimeSettings["execution"]>;
    };
    let dirty = false;
    if (parsed.model.provider === "openai-compatible") {
      parsed.model.provider = "openai";
      dirty = true;
    }
    const execution = parsed.execution;
    if (!execution) {
      parsed.execution = {
        backend: "local",
        dockerImage: "oven/bun:latest",
        dockerNetwork: "host",
        dockerWorkspacePath: "/workspace",
        dockerEnvPassthrough: ["PATH", "HOME"],
        commandTimeoutMs: 30_000,
        healthTimeoutMs: 5_000,
        containerCpuLimit: "2",
        containerMemoryLimit: "2g",
        containerPidsLimit: 256,
        containerReadOnlyRoot: true,
        sshHost: "",
        sshUser: "",
        sshPath: "",
        sshPort: 22,
        sshKeyPath: "",
        sshStrictHostKeyChecking: false,
      };
      dirty = true;
    } else {
      if (execution.dockerNetwork === undefined) {
        parsed.execution.dockerNetwork = "host";
        dirty = true;
      }
      if (execution.dockerWorkspacePath === undefined) {
        parsed.execution.dockerWorkspacePath = "/workspace";
        dirty = true;
      }
      if (!Array.isArray(execution.dockerEnvPassthrough)) {
        parsed.execution.dockerEnvPassthrough = ["PATH", "HOME"];
        dirty = true;
      }
      if (execution.commandTimeoutMs === undefined) {
        parsed.execution.commandTimeoutMs = 30_000;
        dirty = true;
      }
      if (execution.healthTimeoutMs === undefined) {
        parsed.execution.healthTimeoutMs = 5_000;
        dirty = true;
      }
      if (execution.containerCpuLimit === undefined) {
        parsed.execution.containerCpuLimit = "2";
        dirty = true;
      }
      if (execution.containerMemoryLimit === undefined) {
        parsed.execution.containerMemoryLimit = "2g";
        dirty = true;
      }
      if (execution.containerPidsLimit === undefined) {
        parsed.execution.containerPidsLimit = 256;
        dirty = true;
      }
      if (execution.containerReadOnlyRoot === undefined) {
        parsed.execution.containerReadOnlyRoot = true;
        dirty = true;
      }
      if (execution.sshPath === undefined) {
        parsed.execution.sshPath = "";
        dirty = true;
      }
      if (execution.sshPort === undefined) {
        parsed.execution.sshPort = 22;
        dirty = true;
      }
      if (execution.sshKeyPath === undefined) {
        parsed.execution.sshKeyPath = "";
        dirty = true;
      }
      if (execution.sshStrictHostKeyChecking === undefined) {
        parsed.execution.sshStrictHostKeyChecking = false;
        dirty = true;
      }
    }
    if (!parsed.mcp) {
      parsed.mcp = {
        serverCommand: "",
        timeoutMs: 10_000,
      };
      dirty = true;
    } else {
      if (parsed.mcp.serverCommand === undefined) {
        parsed.mcp.serverCommand = "";
        dirty = true;
      }
      if (parsed.mcp.timeoutMs === undefined) {
        parsed.mcp.timeoutMs = 10_000;
        dirty = true;
      }
    }
    if (dirty) {
      this.write(parsed);
    }
    return parsed as RuntimeSettings;
  }

  set(path: string, value: unknown): RuntimeSettings {
    const settings = this.get();
    const segments = path.split(".");
    let current = settings as unknown as Record<string, unknown>;

    while (segments.length > 1) {
      const segment = segments.shift();
      if (!segment) {
        break;
      }
      const next = current[segment];
      if (!next || typeof next !== "object") {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    const leaf = segments[0];
    current[leaf] = value;
    this.write(settings);
    return settings;
  }

  private write(settings: RuntimeSettings): void {
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2), "utf8");
  }
}
