import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  readJsonFileSync,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import type { ManagedAttachmentDescriptor } from "./attachment-import";

const ATTACHMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface ManagedAttachmentMetadata {
  id: string;
  storedName: string;
}

interface PersistedLease {
  version: 1;
  attachmentIds: string[];
}

/**
 * Tracks standard file imports until they are committed to a durable message.
 * The renderer receives a random lease capability, never a filesystem path.
 */
export class ChatAttachmentLifecycle {
  private readonly leases = new Map<string, Set<string>>();
  private readonly committed = new Set<string>();
  private readonly attachmentsDir: string;
  private readonly leasesDir: string;

  constructor(runtimeDataDir: string) {
    this.attachmentsDir = resolve(runtimeDataDir, "attachments");
    this.leasesDir = resolve(this.attachmentsDir, ".leases");
  }

  lease(attachments: readonly ManagedAttachmentDescriptor[]): string {
    const ids = new Set(attachments.map((attachment) => attachment.id));
    if (ids.size === 0 || [...ids].some((id) => !ATTACHMENT_ID.test(id))) {
      throw new Error("Managed attachment IDs are invalid.");
    }
    const capability = randomUUID();
    this.leases.set(capability, ids);
    this.persistLease(capability, ids);
    return capability;
  }

  commit(ids: readonly string[], capability: string): void {
    const leased = this.authorize(ids, capability);
    for (const id of leased) {
      this.committed.add(id);
      this.removeLeaseId(id);
    }
  }

  discard(ids: readonly string[], capability: string): string[] {
    const leased = this.authorize(ids, capability);
    for (const id of leased) {
      if (this.committed.has(id)) {
        throw new Error("A committed attachment cannot be discarded.");
      }
    }
    for (const id of leased) {
      this.removeManagedPair(id);
      this.removeLeaseId(id);
    }
    return leased;
  }

  private authorize(ids: readonly string[], capability: string): string[] {
    if (!ATTACHMENT_ID.test(capability)) {
      throw new Error("Attachment cleanup capability is invalid.");
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error("At least one attachment ID is required.");
    }
    const normalized = [...new Set(ids.map((id) => id.toLowerCase()))];
    if (
      normalized.length !== ids.length ||
      normalized.some((id) => !ATTACHMENT_ID.test(id))
    ) {
      throw new Error("Attachment cleanup IDs are invalid.");
    }
    const lease = this.leases.get(capability) ?? this.loadLease(capability);
    if (!lease || normalized.some((id) => !lease.has(id))) {
      throw new Error("Attachment cleanup is not authorized.");
    }
    return normalized;
  }

  private removeLeaseId(id: string): void {
    for (const [capability, lease] of this.leases) {
      lease.delete(id);
      if (lease.size === 0) {
        this.leases.delete(capability);
        rmSync(this.leasePath(capability), { force: true });
      } else {
        this.persistLease(capability, lease);
      }
    }
  }

  private loadLease(capability: string): Set<string> | undefined {
    const leasePath = this.leasePath(capability);
    if (!existsSync(leasePath)) return undefined;
    let persisted: PersistedLease;
    try {
      persisted = readJsonFileSync<PersistedLease>(leasePath) as PersistedLease;
    } catch {
      throw new Error("Attachment cleanup lease is invalid.");
    }
    if (
      persisted.version !== 1 ||
      !Array.isArray(persisted.attachmentIds) ||
      persisted.attachmentIds.length === 0 ||
      persisted.attachmentIds.some((id) => !ATTACHMENT_ID.test(id))
    ) {
      throw new Error("Attachment cleanup lease is invalid.");
    }
    const lease = new Set(
      persisted.attachmentIds.map((id) => id.toLowerCase()),
    );
    this.leases.set(capability, lease);
    return lease;
  }

  private persistLease(capability: string, ids: ReadonlySet<string>): void {
    mkdirSync(this.leasesDir, { recursive: true, mode: 0o700 });
    chmodSync(this.leasesDir, 0o700);
    const leasePath = this.leasePath(capability);
    const persisted: PersistedLease = {
      version: 1,
      attachmentIds: [...ids],
    };
    writeJsonAtomicSync(leasePath, persisted, { trailingNewline: true });
    chmodSync(leasePath, 0o600);
  }

  private leasePath(capability: string): string {
    return resolve(this.leasesDir, `${capability}.json`);
  }

  private removeManagedPair(id: string): void {
    const metadataPath = this.safePath(`${id}.meta.json`);
    if (!existsSync(metadataPath)) return;
    let metadata: ManagedAttachmentMetadata;
    try {
      metadata = readJsonFileSync<ManagedAttachmentMetadata>(
        metadataPath,
      ) as ManagedAttachmentMetadata;
    } catch {
      throw new Error("Managed attachment metadata is invalid.");
    }
    if (metadata.id !== id || !this.isSafeStoredName(metadata.storedName, id)) {
      throw new Error("Managed attachment metadata does not match its ID.");
    }
    const dataPath = this.safePath(metadata.storedName);
    // A missing file is safe to clean up: remove its surviving metadata sidecar.
    if (existsSync(dataPath)) rmSync(dataPath, { force: true });
    rmSync(metadataPath, { force: true });
  }

  private isSafeStoredName(
    storedName: unknown,
    id: string,
  ): storedName is string {
    return (
      typeof storedName === "string" &&
      basename(storedName) === storedName &&
      storedName.startsWith(`${id}.`) &&
      !storedName.endsWith(".meta.json")
    );
  }

  private safePath(name: string): string {
    const candidate = resolve(this.attachmentsDir, name);
    if (dirname(candidate) !== this.attachmentsDir) {
      throw new Error("Managed attachment path is invalid.");
    }
    return candidate;
  }
}
