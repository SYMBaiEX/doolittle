import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  UiHostCommand,
  UiHostEvent,
  UiHostResult,
  UiHostV1,
  UiMessage,
  UiRunReceipt,
  UiSnapshot,
  UiTarget,
} from "@doolittle/contracts/ui-host";
import type {
  UiPluginArtifactIdentity,
  UiPluginCapability,
  UiPluginGrant,
} from "@doolittle/contracts/ui-plugin";
import type { VerifiedUiArtifact } from "./artifact";

interface Submission {
  key: string;
  runId: string;
  target: UiTarget;
  workspace: string;
  messageDigest: string;
  state: "reserved" | "accepted" | "uncertain" | "rejected";
  rejection?: string;
}

interface PersistedState {
  version: 1;
  sequence: number;
  revision: number;
  generation: number;
  journal: UiHostEvent[];
  grants: UiPluginGrant[];
  grantWorkspaces: Record<string, string>;
  trusted: UiPluginArtifactIdentity[];
  drafts: Record<string, string>;
  selected?: UiTarget;
  submissions: Submission[];
  canonicalCursors?: Record<
    string,
    { cursor: number; sequence: number; textStarted?: boolean }
  >;
}

export type UiHostEventInput = UiHostEvent extends infer Event
  ? Event extends UiHostEvent
    ? Omit<Event, "sequence">
    : never
  : never;

/** Only a known pre-commit rejection or explicit non-success HTTP receipt. */
export class UiSubmissionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UiSubmissionRejectedError";
  }
}

export interface PickedUiAttachment {
  id: string;
  name: string;
  /** This never crosses to the extension renderer. */
  cleanupCapability?: string;
}

/** Inject only canonical, owner-authorized operations. Never inject generic fetch/IPC. */
export interface UiHostBackend {
  getSnapshot(): Promise<UiSnapshot>;
  currentWorkspace(): string;
  ownsTarget(target: UiTarget): Promise<boolean>;
  createConversation(botId: string): Promise<UiTarget>;
  readTranscript(
    target: UiTarget,
    throughRunId?: string,
  ): Promise<{
    messages: UiMessage[];
    transcriptThroughRunId?: string;
  }>;
  readRun(target: UiTarget, runId: string): Promise<UiRunReceipt | undefined>;
  sendChat(input: {
    target: UiTarget;
    runId: string;
    message: string;
    attachments: PickedUiAttachment[];
    workspace: string;
    /** Call after backend preparation, immediately before the irreversible POST. */
    assertAuthorizedAtCommit: () => Promise<void>;
  }): Promise<UiRunReceipt>;
  stopRun(
    target: UiTarget,
    runId: string,
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<UiRunReceipt>;
  pickAttachments(
    target: UiTarget,
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<PickedUiAttachment[]>;
  openSurface(
    target: UiTarget,
    surface: "details" | "library" | "computer",
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<void>;
  presentApproval(
    target: UiTarget,
    runId: string,
    approvalId: string,
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<void>;
}

const EMPTY_STATE: PersistedState = {
  version: 1,
  sequence: 0,
  revision: 0,
  generation: 0,
  journal: [],
  grants: [],
  grantWorkspaces: {},
  trusted: [],
  drafts: {},
  submissions: [],
};
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const ID = /^[a-zA-Z0-9:_-]{1,128}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const MUTATIONS = new Set<UiHostCommand["type"]>([
  "conversation.select",
  "conversation.create",
  "chat.send",
  "run.stop",
  "attachments.pick",
  "surface.open",
  "draft.update",
  "approval.present",
]);

function targetKey(target: UiTarget): string {
  return JSON.stringify([
    target.botId,
    target.sessionId,
    target.projectId ?? null,
  ]);
}

function sameTarget(a: UiTarget, b: UiTarget): boolean {
  return targetKey(a) === targetKey(b);
}

function sameArtifact(
  a: UiPluginArtifactIdentity,
  b: UiPluginArtifactIdentity,
): boolean {
  return (
    a.pluginId === b.pluginId &&
    a.pluginVersion === b.pluginVersion &&
    a.digest === b.digest
  );
}

function validTarget(value: unknown): value is UiTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Partial<UiTarget>;
  return (
    typeof target.botId === "string" &&
    ID.test(target.botId) &&
    typeof target.sessionId === "string" &&
    ID.test(target.sessionId) &&
    (target.projectId === undefined ||
      (typeof target.projectId === "string" && ID.test(target.projectId)))
  );
}

function requireRunReceipt(
  receipt: UiRunReceipt,
  target: UiTarget,
  runId: string,
): void {
  if (
    !receipt ||
    !validTarget(receipt.target) ||
    !sameTarget(receipt.target, target) ||
    receipt.runId !== runId
  ) {
    throw new Error(
      "Canonical run receipt does not match the requested target and run.",
    );
  }
}

function commandCapability(
  command: UiHostCommand,
): UiPluginCapability | "deny" {
  switch (command.type) {
    case "conversation.create":
      return "deny";
    case "conversation.select":
      return "conversation.read";
    case "transcript.read":
      return "conversation.read";
    case "run.read":
      return "conversation.read";
    case "chat.send":
      return "message.send";
    case "run.stop":
      return "run.stop";
    case "attachments.pick":
      return "attachment.pick";
    case "surface.open":
      return "surface.open";
    case "draft.update":
    case "draft.read":
      return "conversation.read";
    case "approval.present":
      return "deny";
    default:
      return "deny";
  }
}

function readState(path: string): PersistedState {
  try {
    if (!existsSync(path)) return structuredClone(EMPTY_STATE);
    const bytes = readFileSync(path);
    if (bytes.byteLength > MAX_STATE_BYTES)
      throw new Error("UI host state is too large.");
    const value = JSON.parse(bytes.toString("utf8")) as Partial<PersistedState>;
    if (
      value.version !== 1 ||
      !Number.isSafeInteger(value.sequence) ||
      Number(value.sequence) < 0 ||
      !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 0 ||
      !Number.isSafeInteger(value.generation) ||
      Number(value.generation) < 0 ||
      !Array.isArray(value.journal) ||
      value.journal.length > 512 ||
      !Array.isArray(value.grants) ||
      !value.grantWorkspaces ||
      typeof value.grantWorkspaces !== "object" ||
      !Array.isArray(value.trusted) ||
      !value.drafts ||
      typeof value.drafts !== "object" ||
      !Array.isArray(value.submissions) ||
      (value.canonicalCursors !== undefined &&
        (typeof value.canonicalCursors !== "object" ||
          value.canonicalCursors === null ||
          Array.isArray(value.canonicalCursors) ||
          Object.keys(value.canonicalCursors).length > 256 ||
          Object.entries(value.canonicalCursors).some(
            ([key, item]) =>
              !SHA.test(key) ||
              !item ||
              !Number.isSafeInteger(item.cursor) ||
              item.cursor < 0 ||
              !Number.isSafeInteger(item.sequence) ||
              item.sequence < 0 ||
              item.sequence > Number(value.sequence) ||
              (item.textStarted !== undefined &&
                typeof item.textStarted !== "boolean"),
          )))
    ) {
      throw new Error("UI host state is invalid.");
    }
    if (
      value.journal.some(
        (item) =>
          !item ||
          !Number.isSafeInteger(item.sequence) ||
          item.sequence > Number(value.sequence),
      )
    ) {
      throw new Error("UI host event journal is invalid.");
    }
    return value as PersistedState;
  } catch (error) {
    // Dropping a reserved submission could resend it, so fail closed.
    throw new Error("UI host state cannot be read safely.", { cause: error });
  }
}

function writeState(path: string, state: PersistedState): void {
  const bytes = Buffer.from(JSON.stringify(state));
  if (bytes.byteLength > MAX_STATE_BYTES)
    throw new Error("UI host state limit reached.");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(temporary, 0o600);
  const fd = openSync(temporary, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  const directoryFd = openSync(dirname(path), "r");
  try {
    fsyncSync(directoryFd);
  } finally {
    closeSync(directoryFd);
  }
}

export interface CommunityCallContext {
  artifact: UiPluginArtifactIdentity;
  generation: number;
  visible: boolean;
}

/** Canonical presentation state and broker policy, independent of renderer lifetime. */
export class UiExtensionHost implements UiHostV1 {
  readonly version = 1 as const;
  private readonly path: string;
  private state: PersistedState;
  private readonly listeners = new Set<(event: UiHostEvent) => void>();
  private journal: UiHostEvent[];
  private readonly attachments = new Map<string, PickedUiAttachment>();
  private readonly inFlightSubmissions = new Map<
    string,
    { digest: string; promise: Promise<UiHostResult> }
  >();
  private sequence: number;
  private revision: number;
  private generation: number;
  private grantRevision = 0;
  private active?: UiPluginArtifactIdentity;
  private visible = false;
  private protectedDialog = false;

  constructor(
    private readonly backend: UiHostBackend,
    statePath: string,
  ) {
    this.path = resolve(statePath);
    this.state = readState(this.path);
    this.sequence = this.state.sequence;
    this.revision = this.state.revision;
    this.journal = this.state.journal;
    this.generation = this.state.generation + 1;
    this.state.generation = this.generation;
    this.persist(); // Invalidate any pre-crash view/grant generation before use.
  }

  get activationGeneration(): number {
    return this.generation;
  }
  get activeArtifact(): UiPluginArtifactIdentity | undefined {
    return this.active;
  }
  get isCommunityVisible(): boolean {
    return this.visible && !this.protectedDialog;
  }
  get isProtectedDialog(): boolean {
    return this.protectedDialog;
  }
  getSelected(): UiTarget | undefined {
    return this.state.selected;
  }
  getDraft(target: UiTarget): string {
    return this.state.drafts[targetKey(target)] ?? "";
  }

  /** Host-owned consent only. UI plugins cannot call these methods via preload. */
  approveTrusted(artifact: VerifiedUiArtifact): void {
    if (artifact.manifest.trustTier !== "trusted-react")
      throw new Error("Trusted consent requires a React artifact.");
    const identity = artifact.identity;
    if (!SHA.test(identity.digest))
      throw new Error("Invalid trusted artifact digest.");
    if (!this.state.trusted.some((item) => sameArtifact(item, identity))) {
      this.state.trusted.push(identity);
      this.persist();
    }
  }

  async approveCommunity(
    artifact: VerifiedUiArtifact,
    grant: UiPluginGrant,
  ): Promise<void> {
    if (
      artifact.manifest.trustTier !== "community-static" ||
      !sameArtifact(artifact.identity, grant.artifact) ||
      grant.capabilities.some(
        (capability) =>
          !artifact.manifest.requestedCapabilities.includes(capability),
      )
    ) {
      throw new Error("Community grant exceeds verified artifact requests.");
    }
    if (
      !this.active ||
      !sameArtifact(this.active, artifact.identity) ||
      !SHA.test(grant.artifact.digest) ||
      grant.generation !== this.generation ||
      grant.targets.length === 0 ||
      grant.capabilities.length === 0 ||
      grant.targets.some((target) => !validTarget(target))
    ) {
      throw new Error("Invalid community UI grant.");
    }
    const workspace = this.backend.currentWorkspace();
    for (const target of grant.targets) {
      if (!(await this.backend.ownsTarget(target)))
        throw new Error("Community UI target is not owned.");
    }
    if (
      workspace !== this.backend.currentWorkspace() ||
      grant.generation !== this.generation
    ) {
      throw new Error("UI grant context changed during approval.");
    }
    this.state.grants = this.state.grants.filter(
      (item) => !sameArtifact(item.artifact, grant.artifact),
    );
    this.state.grants.push(structuredClone(grant));
    this.state.grantWorkspaces[grant.artifact.digest] = workspace;
    this.grantRevision += 1;
    this.attachments.clear();
    this.persist();
  }

  revoke(identity?: UiPluginArtifactIdentity): void {
    this.state.grants = identity
      ? this.state.grants.filter(
          (grant) => !sameArtifact(grant.artifact, identity),
        )
      : [];
    if (identity) delete this.state.grantWorkspaces[identity.digest];
    else this.state.grantWorkspaces = {};
    this.state.trusted = identity
      ? this.state.trusted.filter((item) => !sameArtifact(item, identity))
      : [];
    this.grantRevision += 1;
    this.bumpGeneration();
    this.persist();
  }

  activate(artifact: VerifiedUiArtifact): number {
    const identity = artifact.identity;
    const tier = artifact.manifest.trustTier;
    if (
      tier === "trusted-react" &&
      !this.state.trusted.some((item) => sameArtifact(item, identity))
    ) {
      throw new Error("Trusted React artifact has not been approved.");
    }
    this.bumpGeneration();
    this.active = identity;
    this.visible = tier === "trusted-react";
    return this.generation;
  }

  /** Return verified source only to the trusted host renderer integration. Never execute in main. */
  trustedRendererSource(artifact: VerifiedUiArtifact): {
    source: string;
    digest: string;
  } {
    if (
      artifact.manifest.trustTier !== "trusted-react" ||
      !this.state.trusted.some((item) => sameArtifact(item, artifact.identity))
    ) {
      throw new Error("Trusted React artifact has not been approved.");
    }
    const entry = artifact.assets.get(artifact.manifest.entry);
    if (!entry) throw new Error("Trusted React entry is missing.");
    return { source: entry.toString("utf8"), digest: artifact.identity.digest };
  }

  deactivate(): void {
    this.bumpGeneration();
    this.active = undefined;
    this.visible = false;
    this.attachments.clear();
  }

  setVisible(visible: boolean): void {
    this.visible = visible && !this.protectedDialog;
  }
  setProtectedDialog(active: boolean): void {
    this.protectedDialog = active;
    if (active) this.visible = false;
  }

  async getSnapshot(): Promise<UiSnapshot> {
    const canonical = await this.backend.getSnapshot();
    const bots = canonical.bots.filter((bot) => ID.test(bot.id));
    const conversations = canonical.conversations.filter((conversation) =>
      validTarget(conversation),
    );
    this.state.revision = ++this.revision;
    const selected = this.state.selected;
    // Snapshot reads are untrusted hot-path requests; the event sequence is durable,
    // while a renderer activation uses a fresh generation after restart.
    return {
      version: 1,
      revision: this.revision,
      sequence: this.sequence,
      bots,
      conversations,
      ...(selected && conversations.some((item) => sameTarget(item, selected))
        ? { selected }
        : {}),
    };
  }

  async getCommunitySnapshot(
    context: CommunityCallContext,
  ): Promise<UiSnapshot> {
    this.assertCommunityLive(context);
    const workspace = this.backend.currentWorkspace();
    const grantRevision = this.grantRevision;
    const grant = this.requireGrant(context);
    if (!grant.capabilities.includes("conversation.read"))
      throw new Error("UI capability is not granted.");
    const canonical = await this.getSnapshot();
    this.assertCommunityLive(context);
    if (
      workspace !== this.backend.currentWorkspace() ||
      grantRevision !== this.grantRevision
    )
      throw new Error("UI grant context changed during snapshot.");
    const conversations = [] as UiSnapshot["conversations"];
    for (const item of canonical.conversations) {
      if (
        grant.targets.some((target) => sameTarget(target, item)) &&
        (await this.backend.ownsTarget(item))
      )
        conversations.push(item);
    }
    this.assertCommunityLive(context);
    if (
      workspace !== this.backend.currentWorkspace() ||
      grantRevision !== this.grantRevision
    )
      throw new Error("UI grant context changed during snapshot.");
    const current = this.requireGrant(context);
    if (!current.capabilities.includes("conversation.read"))
      throw new Error("UI capability is not granted.");
    const stillGranted = conversations.filter((item) =>
      current.targets.some((target) => sameTarget(target, item)),
    );
    const currentOwnership = await Promise.all(
      stillGranted.map((item) => this.backend.ownsTarget(item)),
    );
    this.assertCommunityLive(context);
    if (
      workspace !== this.backend.currentWorkspace() ||
      grantRevision !== this.grantRevision
    )
      throw new Error("UI grant context changed during snapshot.");
    const authorized = stillGranted.filter(
      (_item, index) => currentOwnership[index],
    );
    const selected = canonical.selected;
    return {
      ...canonical,
      bots: canonical.bots.filter((bot) =>
        authorized.some((item) => item.botId === bot.id),
      ),
      conversations: authorized,
      selected:
        selected && authorized.some((item) => sameTarget(item, selected))
          ? selected
          : undefined,
    };
  }

  subscribe(
    listener: (event: UiHostEvent) => void,
    after = this.sequence,
  ): () => void {
    const firstEvent = this.journal[0];
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      (after < this.sequence &&
        (!firstEvent || after < firstEvent.sequence - 1))
    ) {
      throw new Error("UI event replay gap; refresh the canonical snapshot.");
    }
    this.listeners.add(listener);
    for (const event of this.journal)
      if (event.sequence > after) listener(event);
    return () => this.listeners.delete(listener);
  }

  subscribeCommunity(
    context: CommunityCallContext,
    listener: (event: UiHostEvent) => void,
    after = this.sequence,
  ): () => void {
    this.assertCommunityLive(context);
    const workspace = this.backend.currentWorkspace();
    const grantRevision = this.grantRevision;
    const grant = this.requireGrant(context);
    if (!grant.capabilities.includes("conversation.read"))
      throw new Error("UI capability is not granted.");
    let queue = Promise.resolve();
    return this.subscribe((event) => {
      if (
        !this.isCommunityLive(context) ||
        this.backend.currentWorkspace() !== workspace ||
        this.grantRevision !== grantRevision
      )
        return;
      if (event.type === "snapshot") return;
      if (!grant.targets.some((target) => sameTarget(target, event.target)))
        return;
      queue = queue
        .then(async () => {
          if (
            !this.isCommunityLive(context) ||
            this.backend.currentWorkspace() !== workspace ||
            this.grantRevision !== grantRevision
          )
            return;
          try {
            const current = this.requireGrant(context);
            if (
              !current.capabilities.includes("conversation.read") ||
              !current.targets.some((target) =>
                sameTarget(target, event.target),
              )
            )
              return;
          } catch {
            return;
          }
          if (!(await this.backend.ownsTarget(event.target))) return;
          if (
            this.isCommunityLive(context) &&
            this.backend.currentWorkspace() === workspace &&
            this.grantRevision === grantRevision
          ) {
            try {
              const current = this.requireGrant(context);
              if (
                current.capabilities.includes("conversation.read") &&
                current.targets.some((target) =>
                  sameTarget(target, event.target),
                )
              )
                listener(event);
            } catch {
              /* grant changed while ownership was checked */
            }
          }
        })
        .catch(() => undefined);
    }, after);
  }

  publish(event: UiHostEventInput): void {
    this.publishBatch([event]);
  }

  canonicalCursor(sourceKey: string): {
    cursor: number;
    sequence: number;
    textStarted?: boolean;
  } {
    if (!SHA.test(sourceKey))
      throw new Error("Invalid canonical event identity.");
    return (
      this.state.canonicalCursors?.[sourceKey] ?? { cursor: 0, sequence: 0 }
    );
  }

  /** Persist native replay acknowledgement and its entire projection together. */
  publishCanonical(
    sourceKey: string,
    cursor: number,
    events: UiHostEventInput[],
  ): void {
    if (!SHA.test(sourceKey) || !Number.isSafeInteger(cursor) || cursor < 1)
      throw new Error("Invalid canonical event identity.");
    if (cursor <= this.canonicalCursor(sourceKey).cursor) return;
    this.publishBatch(events, { sourceKey, cursor });
  }

  private publishBatch(
    events: UiHostEventInput[],
    source?: { sourceKey: string; cursor: number },
  ): void {
    if (
      events.length > 64 ||
      events.some(
        (event) => Buffer.byteLength(JSON.stringify(event)) > 16 * 1024,
      )
    )
      throw new Error("UI event exceeds journal limit.");
    let sequence = this.sequence;
    const projected = events.map(
      (event) => ({ ...event, sequence: ++sequence }) as UiHostEvent,
    );
    const cursors = { ...this.state.canonicalCursors };
    if (source)
      cursors[source.sourceKey] = {
        cursor: source.cursor,
        sequence,
        ...(cursors[source.sourceKey]?.textStarted ||
        events.some((event) => event.type === "message.delta")
          ? { textStarted: true }
          : {}),
      };
    // Bounded per-run replay cursors. A terminal run outside this window requires
    // an explicit canonical transcript boundary instead of guessed replay.
    const entries = Object.entries(cursors)
      .sort((a, b) => b[1].sequence - a[1].sequence)
      .slice(0, 256);
    const state: PersistedState = {
      ...this.state,
      sequence,
      journal: [...this.journal, ...projected].slice(-64),
      canonicalCursors: Object.fromEntries(entries),
    };
    writeState(this.path, state);
    this.state = state;
    this.journal = state.journal;
    this.sequence = sequence;
    for (const event of projected) {
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch {
          /* A failed observer may replay; never cancel a run. */
        }
      }
    }
  }

  async dispatch(command: UiHostCommand): Promise<UiHostResult> {
    return this.execute(command);
  }

  async dispatchCommunity(
    context: CommunityCallContext,
    command: UiHostCommand,
  ): Promise<UiHostResult> {
    this.assertCommunityLive(context);
    const workspace = this.backend.currentWorkspace();
    const grantRevision = this.grantRevision;
    if (
      !command ||
      typeof command !== "object" ||
      typeof command.type !== "string"
    )
      throw new Error("Invalid UI command.");
    const capability = commandCapability(command);
    if (capability === "deny")
      throw new Error("Community UI command is not available.");
    const recheck = () => {
      this.assertCommunityLive(context);
      if (this.backend.currentWorkspace() !== workspace)
        throw new Error("UI workspace changed during command.");
      if (this.grantRevision !== grantRevision)
        throw new Error("UI grant changed during command.");
      const current = this.requireGrant(context);
      if (!current.capabilities.includes(capability))
        throw new Error("UI capability is not granted.");
      if (
        "target" in command &&
        (!validTarget(command.target) ||
          !current.targets.some((target) => sameTarget(target, command.target)))
      )
        throw new Error("UI target is not granted.");
    };
    recheck();
    // Re-evaluate mutable grant/workspace state after awaits, not a captured grant.
    return this.execute(command, recheck);
  }

  private async execute(
    command: UiHostCommand,
    recheck: () => void = () => undefined,
  ): Promise<UiHostResult> {
    const requestId = randomUUID();
    if (
      !command ||
      typeof command !== "object" ||
      typeof command.type !== "string"
    )
      throw new Error("Invalid UI command.");
    if (MUTATIONS.has(command.type)) recheck();
    if (command.type === "conversation.create") {
      if (!ID.test(command.botId)) throw new Error("Invalid bot ID.");
      const target = await this.backend.createConversation(command.botId);
      return { requestId, accepted: true, target };
    }
    if (!("target" in command) || !validTarget(command.target))
      throw new Error("Invalid UI target.");
    const target = command.target;
    if (!(await this.backend.ownsTarget(target)))
      throw new Error("UI target is not owned.");
    recheck();
    const assertAuthorizedAtCommit = async () => {
      recheck();
      if (!(await this.backend.ownsTarget(target)))
        throw new Error("UI target ownership changed.");
      recheck();
    };
    switch (command.type) {
      case "conversation.select":
        this.state.selected = target;
        this.state.revision = ++this.revision;
        this.persist();
        return { requestId, accepted: true, target };
      case "draft.read": {
        recheck();
        if (!(await this.backend.ownsTarget(target)))
          throw new Error("UI target ownership changed.");
        recheck();
        const text = this.state.drafts[targetKey(target)] ?? "";
        return { requestId, accepted: true, draft: { target, text } };
      }
      case "transcript.read": {
        if (
          command.throughRunId !== undefined &&
          !ID.test(command.throughRunId)
        )
          throw new Error("Invalid run ID.");
        const result = await this.backend.readTranscript(
          target,
          command.throughRunId,
        );
        recheck();
        if (!(await this.backend.ownsTarget(target)))
          throw new Error("UI target ownership changed.");
        recheck();
        if (
          command.throughRunId &&
          result.transcriptThroughRunId !== command.throughRunId
        ) {
          throw new Error("Canonical transcript boundary is unavailable.");
        }
        return {
          requestId,
          accepted: true,
          messages: result.messages,
          target,
          ...(result.transcriptThroughRunId
            ? { transcriptThroughRunId: result.transcriptThroughRunId }
            : {}),
        };
      }
      case "run.read": {
        if (!ID.test(command.runId)) throw new Error("Invalid run ID.");
        const run = await this.backend.readRun(target, command.runId);
        recheck();
        if (!(await this.backend.ownsTarget(target)))
          throw new Error("UI target ownership changed.");
        recheck();
        if (run) requireRunReceipt(run, target, command.runId);
        return {
          requestId,
          accepted: Boolean(run),
          run,
          runId: run?.runId,
          target,
        };
      }
      case "chat.send":
        return this.send(
          requestId,
          target,
          command,
          recheck,
          assertAuthorizedAtCommit,
        );
      case "run.stop": {
        if (!ID.test(command.runId)) throw new Error("Invalid run ID.");
        recheck();
        const run = await this.backend.stopRun(
          target,
          command.runId,
          assertAuthorizedAtCommit,
        );
        recheck();
        if (!(await this.backend.ownsTarget(target)))
          throw new Error("UI target ownership changed.");
        recheck();
        requireRunReceipt(run, target, command.runId);
        return { requestId, accepted: true, run, runId: run.runId, target };
      }
      case "attachments.pick": {
        recheck();
        const picked = await this.backend.pickAttachments(
          target,
          assertAuthorizedAtCommit,
        );
        recheck();
        if (!(await this.backend.ownsTarget(target)))
          throw new Error("UI target ownership changed.");
        recheck();
        for (const item of picked)
          this.attachments.set(
            this.attachmentKey(
              target,
              item.id,
              this.backend.currentWorkspace(),
            ),
            item,
          );
        return {
          requestId,
          accepted: true,
          attachments: picked.map(({ id, name }) => ({ id, name })),
        };
      }
      case "surface.open": {
        if (!["details", "library", "computer"].includes(command.surface))
          throw new Error("Invalid UI surface.");
        recheck();
        await this.backend.openSurface(
          target,
          command.surface,
          assertAuthorizedAtCommit,
        );
        recheck();
        return { requestId, accepted: true };
      }
      case "approval.present": {
        if (!ID.test(command.runId) || !ID.test(command.approvalId))
          throw new Error("Invalid approval reference.");
        recheck();
        await this.backend.presentApproval(
          target,
          command.runId,
          command.approvalId,
          assertAuthorizedAtCommit,
        );
        recheck();
        return { requestId, accepted: true };
      }
      case "draft.update": {
        if (typeof command.text !== "string" || command.text.length > 50_000)
          throw new Error("Invalid draft.");
        recheck();
        this.state.drafts[targetKey(target)] = command.text;
        this.state.revision = ++this.revision;
        this.persist();
        return { requestId, accepted: true };
      }
      default:
        throw new Error("Unsupported UI command.");
    }
  }

  private async send(
    requestId: string,
    target: UiTarget,
    command: Extract<UiHostCommand, { type: "chat.send" }>,
    recheck: () => void,
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<UiHostResult> {
    if (
      !ID.test(command.submissionId) ||
      (command.runId !== undefined && !ID.test(command.runId)) ||
      typeof command.message !== "string" ||
      !command.message.trim() ||
      command.message.length > 50_000 ||
      (command.attachmentIds !== undefined &&
        (!Array.isArray(command.attachmentIds) ||
          command.attachmentIds.length > 8 ||
          command.attachmentIds.some(
            (id) => typeof id !== "string" || !ID.test(id),
          )))
    ) {
      throw new Error("Invalid UI submission.");
    }
    const workspace = this.backend.currentWorkspace();
    const key = `${targetKey(target)}:${command.submissionId}`;
    const digest = createHash("sha256")
      .update(
        JSON.stringify([
          command.message,
          command.attachmentIds ?? [],
          command.runId ?? null,
        ]),
      )
      .digest("hex");
    const inFlight = this.inFlightSubmissions.get(key);
    if (inFlight) {
      if (inFlight.digest !== digest)
        throw new Error("Submission ID reused with different content.");
      return inFlight.promise;
    }
    const promise = this.sendOnce(
      requestId,
      target,
      command,
      recheck,
      assertAuthorizedAtCommit,
      workspace,
      key,
      digest,
    );
    this.inFlightSubmissions.set(key, { digest, promise });
    try {
      return await promise;
    } finally {
      this.inFlightSubmissions.delete(key);
    }
  }

  private async sendOnce(
    requestId: string,
    target: UiTarget,
    command: Extract<UiHostCommand, { type: "chat.send" }>,
    recheck: () => void,
    assertAuthorizedAtCommit: () => Promise<void>,
    workspace: string,
    key: string,
    digest: string,
  ): Promise<UiHostResult> {
    const previous = this.state.submissions.find((item) => item.key === key);
    if (previous) {
      if (previous.messageDigest !== digest || previous.workspace !== workspace)
        throw new Error(
          "Submission ID reused with different content or workspace.",
        );
      if (previous.state === "rejected")
        return {
          requestId,
          accepted: false,
          runId: previous.runId,
          target,
          error: previous.rejection ?? "Submission was rejected.",
        };
      const receipt = await this.backend.readRun(target, previous.runId);
      recheck();
      if (!(await this.backend.ownsTarget(target)))
        throw new Error("UI target ownership changed.");
      recheck();
      if (receipt) requireRunReceipt(receipt, target, previous.runId);
      if (receipt)
        return {
          requestId,
          accepted: true,
          runId: receipt.runId,
          run: receipt,
          target,
        };
      return {
        requestId,
        accepted: false,
        runId: previous.runId,
        target,
        error: "Submission outcome is uncertain. The host will not resend it.",
      };
    }
    const attachments = (command.attachmentIds ?? []).map((id) => {
      const item = this.attachments.get(
        this.attachmentKey(target, id, workspace),
      );
      if (!item) throw new Error("Attachment was not picked for this target.");
      return item;
    });
    const runId =
      command.runId ??
      `ui-${createHash("sha256").update(key).digest("hex").slice(0, 48)}`;
    if (await this.backend.readRun(target, runId)) {
      recheck();
      throw new Error("Canonical run identity already exists.");
    }
    if (this.state.submissions.length >= 4096)
      throw new Error("UI submission journal is full.");
    recheck();
    if (
      workspace !== this.backend.currentWorkspace() ||
      !(await this.backend.ownsTarget(target))
    )
      throw new Error("UI target or workspace changed.");
    recheck();
    const record: Submission = {
      key,
      runId,
      target,
      workspace,
      messageDigest: digest,
      state: "reserved",
    };
    this.state.submissions.push(record);
    this.persist(); // Durable BEFORE POST; an ambiguous failure never resends.
    let sent: UiRunReceipt;
    try {
      recheck();
      sent = await this.backend.sendChat({
        target,
        runId,
        message: command.message,
        attachments,
        workspace,
        assertAuthorizedAtCommit,
      });
    } catch (error) {
      if (error instanceof UiSubmissionRejectedError) {
        record.state = "rejected";
        record.rejection = error.message;
        this.persist();
        return {
          requestId,
          accepted: false,
          runId,
          target,
          error: error.message,
        };
      }
      record.state = "uncertain";
      this.persist();
      recheck();
      const receipt = await this.backend
        .readRun(target, runId)
        .catch(() => undefined);
      recheck();
      if (!(await this.backend.ownsTarget(target)))
        throw new Error("UI target ownership changed.");
      recheck();
      if (receipt) requireRunReceipt(receipt, target, runId);
      if (receipt)
        return { requestId, accepted: true, runId, run: receipt, target };
      return {
        requestId,
        accepted: false,
        runId,
        target,
        error:
          "Submission outcome is uncertain. Check the run receipt; it was not resent.",
      };
    }
    requireRunReceipt(sent, target, runId);
    record.state = "accepted";
    this.persist();
    recheck();
    if (!(await this.backend.ownsTarget(target)))
      throw new Error("UI target ownership changed.");
    recheck();
    return { requestId, accepted: true, runId, run: sent, target };
  }

  private isCommunityLive(context: CommunityCallContext): boolean {
    return (
      this.active !== undefined &&
      sameArtifact(this.active, context.artifact) &&
      context.generation === this.generation &&
      context.visible &&
      this.visible &&
      !this.protectedDialog
    );
  }

  private attachmentKey(
    target: UiTarget,
    id: string,
    workspace: string,
  ): string {
    return JSON.stringify([workspace, this.generation, targetKey(target), id]);
  }

  private assertCommunityLive(context: CommunityCallContext): void {
    if (!this.isCommunityLive(context))
      throw new Error("Community UI is inactive.");
  }

  private requireGrant(context: CommunityCallContext): UiPluginGrant {
    const grant = this.state.grants.find(
      (item) =>
        sameArtifact(item.artifact, context.artifact) &&
        item.generation === context.generation,
    );
    if (
      !grant ||
      this.state.grantWorkspaces[context.artifact.digest] !==
        this.backend.currentWorkspace()
    ) {
      throw new Error("Community UI grant is unavailable in this workspace.");
    }
    return grant;
  }

  private bumpGeneration(): void {
    this.generation += 1;
    this.state.generation = this.generation;
    this.attachments.clear();
    this.persist();
  }
  private persist(): void {
    writeState(this.path, this.state);
  }
}
