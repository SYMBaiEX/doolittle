import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import {
  DOOLITTLE_SANDBOX_PREFIX,
  type LocalSandboxServiceOptions,
  SANDBOX_OWNER_LOCK_SUFFIX,
  type SandboxOwnerRecord,
  SandboxOwnershipError,
} from "./types";

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function stableHash(value: string, length = 24): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function currentUserIdentity(): string {
  if (typeof process.getuid === "function") {
    return `uid:${process.getuid()}`;
  }
  return `user:${userInfo().username}`;
}

export function resolveSandboxPaths(
  options: Pick<LocalSandboxServiceOptions, "rootDir" | "containerPrefix">,
): {
  rootDir: string;
  containerPrefix: string;
} {
  const userIdentity = currentUserIdentity();
  const userNamespace = stableHash(userIdentity, 16);
  const rootDir = resolve(
    options.rootDir ??
      join(tmpdir(), `${DOOLITTLE_SANDBOX_PREFIX}-${userNamespace}`),
  );
  return {
    rootDir,
    containerPrefix:
      options.containerPrefix ??
      `${DOOLITTLE_SANDBOX_PREFIX}-${stableHash(`${userIdentity}\0${rootDir}`)}`,
  };
}

/** Exclusive filesystem lease for one user's sandbox namespace. */
export class SandboxOwnershipLease {
  readonly lockPath: string;
  private readonly recoveryLockPath: string;
  private readonly processId: number;
  private readonly nonceFactory: () => string;
  private readonly isProcessAlive: (processId: number) => boolean;
  private ownership?: SandboxOwnerRecord;

  constructor(
    rootDir: string,
    options: Pick<
      LocalSandboxServiceOptions,
      "processId" | "nonceFactory" | "isProcessAlive"
    >,
  ) {
    this.lockPath = `${rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;
    this.recoveryLockPath = `${this.lockPath}.recovery`;
    this.processId = options.processId ?? process.pid;
    this.nonceFactory = options.nonceFactory ?? randomUUID;
    this.isProcessAlive = options.isProcessAlive ?? this.checkProcessAlive;
  }

  get held(): boolean {
    return Boolean(this.ownership);
  }

  acquire(): void {
    const owner = { pid: this.processId, nonce: this.nonceFactory() };
    if (this.tryCreateOwnershipLock(this.lockPath, owner)) {
      this.ownership = owner;
      return;
    }

    const existing = this.readOwnershipLock(this.lockPath);
    if (!existing) {
      this.acquire();
      return;
    }
    if (this.isProcessAlive(existing.pid)) {
      throw new SandboxOwnershipError(
        `Local sandbox is already owned by live process ${existing.pid}`,
        this.lockPath,
        existing.pid,
      );
    }

    const recoveryOwner = {
      pid: this.processId,
      nonce: `${owner.nonce}:recovery`,
    };
    if (!this.tryCreateOwnershipLock(this.recoveryLockPath, recoveryOwner)) {
      throw new SandboxOwnershipError(
        "Local sandbox ownership recovery is already in progress",
        this.recoveryLockPath,
      );
    }

    try {
      const current = this.readOwnershipLock(this.lockPath);
      if (current && this.isProcessAlive(current.pid)) {
        throw new SandboxOwnershipError(
          `Local sandbox is already owned by live process ${current.pid}`,
          this.lockPath,
          current.pid,
        );
      }
      if (current) {
        unlinkSync(this.lockPath);
      }
      if (!this.tryCreateOwnershipLock(this.lockPath, owner)) {
        const winner = this.readOwnershipLock(this.lockPath);
        throw new SandboxOwnershipError(
          winner
            ? `Local sandbox ownership was acquired by process ${winner.pid}`
            : "Local sandbox ownership changed during recovery",
          this.lockPath,
          winner?.pid,
        );
      }
      this.ownership = owner;
    } finally {
      this.releaseOwnedLock(this.recoveryLockPath, recoveryOwner);
    }
  }

  release(): void {
    if (!this.ownership) {
      return;
    }
    this.releaseOwnedLock(this.lockPath, this.ownership);
    this.ownership = undefined;
  }

  private tryCreateOwnershipLock(
    lockPath: string,
    owner: SandboxOwnerRecord,
  ): boolean {
    let descriptor: number;
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        return false;
      }
      throw error;
    }

    try {
      if (
        !Number.isSafeInteger(owner.pid) ||
        owner.pid <= 0 ||
        owner.nonce.length === 0 ||
        /[\r\n]/.test(owner.nonce)
      ) {
        throw new SandboxOwnershipError(
          "Local sandbox ownership record is invalid",
          lockPath,
          owner.pid,
        );
      }
      writeFileSync(descriptor, `${owner.pid}\n${owner.nonce}\n`, "utf8");
    } catch (error) {
      closeSync(descriptor);
      unlinkSync(lockPath);
      throw error;
    }
    closeSync(descriptor);
    return true;
  }

  private readOwnershipLock(lockPath: string): SandboxOwnerRecord | undefined {
    let raw: string;
    try {
      raw = readFileSync(lockPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }

    const match = /^([1-9][0-9]*)\n([^\r\n]+)\n$/.exec(raw);
    const pid = match ? Number(match[1]) : Number.NaN;
    if (!match || !Number.isSafeInteger(pid)) {
      throw new SandboxOwnershipError(
        "Local sandbox ownership lock is unreadable; refusing unsafe recovery",
        lockPath,
      );
    }
    return { pid, nonce: match[2] ?? "" };
  }

  private releaseOwnedLock(
    lockPath: string,
    expected: SandboxOwnerRecord,
  ): void {
    const current = this.readOwnershipLock(lockPath);
    if (
      !current ||
      current.pid !== expected.pid ||
      current.nonce !== expected.nonce
    ) {
      throw new SandboxOwnershipError(
        "Local sandbox ownership changed; refusing to release another owner",
        lockPath,
        current?.pid,
      );
    }
    unlinkSync(lockPath);
  }

  private checkProcessAlive(processId: number): boolean {
    try {
      process.kill(processId, 0);
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ESRCH") {
        return false;
      }
      return true;
    }
  }
}
