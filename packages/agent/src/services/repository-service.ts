import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export class RepositoryService {
  private gitRootCache?: string | null;
  private readonly commandCache = new Map<
    string,
    {
      capturedAt: number;
      value: string;
    }
  >();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(private readonly workspaceDir: string) {}

  isRepository(): boolean {
    return Boolean(this.gitRoot());
  }

  async status(): Promise<string> {
    if (!this.gitRoot()) {
      return "(workspace is not inside a git repository)";
    }
    return this.run("git status --short --branch");
  }

  async diffStat(): Promise<string> {
    if (!this.gitRoot()) {
      return "(workspace is not inside a git repository)";
    }
    return this.run("git diff --stat");
  }

  async recentCommits(limit = 5): Promise<string> {
    if (!this.gitRoot()) {
      return "(workspace is not inside a git repository)";
    }
    return this.run(`git log --oneline -n ${limit}`);
  }

  private async run(command: string): Promise<string> {
    const cached = this.commandCache.get(command);
    const now = Date.now();
    if (cached && now - cached.capturedAt < 3_000) {
      return cached.value;
    }

    const pending = this.inflight.get(command);
    if (pending) {
      return pending;
    }

    const promise = (async () => {
      const cwd = this.gitRoot() ?? this.workspaceDir;
      const proc = Bun.spawn({
        cmd: ["/bin/zsh", "-lc", command],
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      if (exitCode !== 0) {
        throw new Error(
          stderr.trim() || `Command failed with exit code ${exitCode}.`,
        );
      }

      const value = stdout.trim() || "(no output)";
      this.commandCache.set(command, {
        capturedAt: Date.now(),
        value,
      });
      return value;
    })();

    this.inflight.set(command, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(command);
    }
  }

  private gitRoot(): string | null {
    if (this.gitRootCache !== undefined) {
      return this.gitRootCache;
    }
    let current = this.workspaceDir;

    while (true) {
      if (existsSync(join(current, ".git"))) {
        this.gitRootCache = current;
        return current;
      }

      const parent = dirname(current);
      if (parent === current) {
        this.gitRootCache = null;
        return null;
      }

      current = parent;
    }
  }
}
