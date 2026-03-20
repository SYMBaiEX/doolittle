import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export class RepositoryService {
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
      throw new Error(stderr.trim() || `Command failed with exit code ${exitCode}.`);
    }

    return stdout.trim() || "(no output)";
  }

  private gitRoot(): string | null {
    let current = this.workspaceDir;

    while (true) {
      if (existsSync(join(current, ".git"))) {
        return current;
      }

      const parent = dirname(current);
      if (parent === current) {
        return null;
      }

      current = parent;
    }
  }
}
