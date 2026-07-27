const REVIEW_PROCESS_TIMEOUT_MS = 8_000;
const REVIEW_PROCESS_OUTPUT_BYTES = 512 * 1024;
const MAX_TEXT_LENGTH = 500;
const MAX_URL_LENGTH = 2_048;
const MAX_COLLECTION_SIZE = 50;

export type RepositoryReviewDegradedReason =
  | "not_repository"
  | "git_unavailable"
  | "gh_unavailable"
  | "not_authenticated"
  | "unsupported_remote"
  | "no_pull_request"
  | "network_error"
  | "malformed_response"
  | "timeout";

export interface RepositoryReviewLocalSummary {
  isRepository: boolean;
  root?: string;
  branch?: string;
  head?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: number;
}

export interface RepositoryReviewRemote {
  host: "github.com";
  owner: string;
  name: string;
  slug: string;
  url: string;
}

export interface RepositoryPullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged" | "unknown";
  url: string;
  author?: string;
  isDraft: boolean;
  reviewDecision?: string;
  mergeStateStatus?: string;
  headRefName?: string;
  baseRefName?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  comments: number;
  reviews: number;
  reviewRequests: string[];
  labels: string[];
  updatedAt?: string;
}

export interface RepositoryReviewCheck {
  name: string;
  status: "queued" | "in_progress" | "completed" | "unknown";
  conclusion?: string;
  url?: string;
  workflow?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RepositoryWorkflowRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed" | "unknown";
  conclusion?: string;
  url?: string;
  event?: string;
  headBranch?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RepositoryReviewResult {
  state: "ready" | "degraded";
  local: RepositoryReviewLocalSummary;
  repository?: RepositoryReviewRemote;
  branch?: string;
  pullRequest?: RepositoryPullRequest;
  checks: RepositoryReviewCheck[];
  workflowRuns: RepositoryWorkflowRun[];
  degraded?: {
    reason: RepositoryReviewDegradedReason;
    detail: string;
  };
  fetchedAt: string;
}

export interface RepositoryReviewProcessRequest {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
}

export interface RepositoryReviewProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RepositoryReviewProcessRunner = (
  request: RepositoryReviewProcessRequest,
) => Promise<RepositoryReviewProcessResult>;

interface RepositoryReviewServiceOptions {
  run?: RepositoryReviewProcessRunner;
  now?: () => Date;
}

type ProcessFailureKind = "missing" | "timeout" | "output_limit" | "aborted";

export class RepositoryReviewProcessError extends Error {
  constructor(readonly kind: ProcessFailureKind) {
    super(kind);
  }
}

function sanitizedText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string") return "";
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined &&
        (codePoint === 9 || codePoint >= 32) &&
        !(codePoint >= 127 && codePoint <= 159) &&
        !/\p{Cf}/u.test(character)
      );
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

function sanitizedOptionalText(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH,
): string | undefined {
  const result = sanitizedText(value, maxLength);
  return result || undefined;
}

function sanitizedDate(value: unknown): string | undefined {
  const text = sanitizedText(value, 64);
  if (!text) return undefined;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function sanitizedCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function sanitizedGithubUrl(value: unknown): string | undefined {
  const text = sanitizedText(value, MAX_URL_LENGTH);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizedStatus(
  value: unknown,
): "queued" | "in_progress" | "completed" | "unknown" {
  const status = sanitizedText(value, 32).toLowerCase();
  if (status === "queued" || status === "pending" || status === "waiting") {
    return "queued";
  }
  if (status === "in_progress" || status === "in progress") {
    return "in_progress";
  }
  if (status === "completed" || status === "complete") return "completed";
  return "unknown";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonRecord(output: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(output));
  } catch {
    return null;
  }
}

function parseJsonArray(output: string): unknown[] | null {
  try {
    const value = JSON.parse(output);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function parseRemote(value: string): RepositoryReviewRemote | null {
  const raw = sanitizedText(value, MAX_URL_LENGTH);
  if (!raw) return null;

  let host = "";
  let pathname = "";
  if (/^[^/@\s]+@[^:/\s]+:[^/\s].*$/u.test(raw)) {
    const separator = raw.indexOf(":");
    const identity = raw.slice(0, separator);
    host = identity.slice(identity.lastIndexOf("@") + 1).toLowerCase();
    pathname = raw.slice(separator + 1);
  } else {
    try {
      const url = new URL(raw);
      if (!["https:", "ssh:"].includes(url.protocol)) return null;
      host = url.hostname.toLowerCase();
      pathname = url.pathname.replace(/^\/+/u, "");
    } catch {
      return null;
    }
  }

  if (host !== "github.com") return null;
  const segments = pathname.replace(/\.git$/u, "").split("/");
  if (segments.length !== 2) return null;
  const [owner, name] = segments;
  const safeSegment = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/u;
  if (!owner || !name || !safeSegment.test(owner) || !safeSegment.test(name)) {
    return null;
  }
  return {
    host: "github.com",
    owner,
    name,
    slug: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };
}

function parseChecks(value: unknown): RepositoryReviewCheck[] | null {
  if (!Array.isArray(value)) return null;
  const checks: RepositoryReviewCheck[] = [];
  for (const item of value.slice(0, MAX_COLLECTION_SIZE)) {
    const record = asRecord(item);
    if (!record) return null;
    const typename = sanitizedText(record.__typename, 32);
    const name =
      typename === "StatusContext"
        ? sanitizedText(record.context)
        : sanitizedText(record.name);
    if (!name) return null;
    const check: RepositoryReviewCheck = {
      name,
      status:
        typename === "StatusContext"
          ? normalizedStatus(
              sanitizedText(record.state, 32).toLowerCase() === "pending"
                ? "queued"
                : "completed",
            )
          : normalizedStatus(record.status),
    };
    const conclusion = sanitizedOptionalText(
      typename === "StatusContext" ? record.state : record.conclusion,
      64,
    );
    const url = sanitizedGithubUrl(
      typename === "StatusContext" ? record.targetUrl : record.detailsUrl,
    );
    const workflow = sanitizedOptionalText(record.workflowName);
    const startedAt = sanitizedDate(record.startedAt);
    const completedAt = sanitizedDate(record.completedAt);
    if (conclusion) check.conclusion = conclusion.toLowerCase();
    if (url) check.url = url;
    if (workflow) check.workflow = workflow;
    if (startedAt) check.startedAt = startedAt;
    if (completedAt) check.completedAt = completedAt;
    checks.push(check);
  }
  return checks;
}

function recordName(value: unknown): string | undefined {
  if (typeof value === "string") return sanitizedOptionalText(value, 100);
  const record = asRecord(value);
  return sanitizedOptionalText(record?.login ?? record?.name, 100);
}

function recordNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_COLLECTION_SIZE)
    .map(recordName)
    .filter((name): name is string => Boolean(name));
}

function parsePullRequest(record: Record<string, unknown>): {
  pullRequest: RepositoryPullRequest;
  checks: RepositoryReviewCheck[];
} | null {
  const number = sanitizedCount(record.number);
  const title = sanitizedText(record.title);
  const url = sanitizedGithubUrl(record.url);
  const checks = parseChecks(record.statusCheckRollup);
  if (!number || !title || !url || !checks) return null;
  const stateText = sanitizedText(record.state, 32).toLowerCase();
  const state = ["open", "closed", "merged"].includes(stateText)
    ? (stateText as RepositoryPullRequest["state"])
    : "unknown";
  const author = recordName(record.author);
  const pullRequest: RepositoryPullRequest = {
    number,
    title,
    state,
    url,
    isDraft: record.isDraft === true,
    additions: sanitizedCount(record.additions),
    deletions: sanitizedCount(record.deletions),
    changedFiles: sanitizedCount(record.changedFiles),
    comments: Array.isArray(record.comments)
      ? Math.min(record.comments.length, MAX_COLLECTION_SIZE)
      : 0,
    reviews: Array.isArray(record.reviews)
      ? Math.min(record.reviews.length, MAX_COLLECTION_SIZE)
      : 0,
    reviewRequests: recordNames(record.reviewRequests),
    labels: recordNames(record.labels),
  };
  if (author) pullRequest.author = author;
  const reviewDecision = sanitizedOptionalText(record.reviewDecision, 64);
  const mergeStateStatus = sanitizedOptionalText(record.mergeStateStatus, 64);
  const headRefName = sanitizedOptionalText(record.headRefName, 255);
  const baseRefName = sanitizedOptionalText(record.baseRefName, 255);
  const updatedAt = sanitizedDate(record.updatedAt);
  if (reviewDecision) pullRequest.reviewDecision = reviewDecision.toLowerCase();
  if (mergeStateStatus) {
    pullRequest.mergeStateStatus = mergeStateStatus.toLowerCase();
  }
  if (headRefName) pullRequest.headRefName = headRefName;
  if (baseRefName) pullRequest.baseRefName = baseRefName;
  if (updatedAt) pullRequest.updatedAt = updatedAt;
  return { pullRequest, checks };
}

function parseWorkflowRuns(value: unknown[]): RepositoryWorkflowRun[] | null {
  const runs: RepositoryWorkflowRun[] = [];
  for (const item of value.slice(0, MAX_COLLECTION_SIZE)) {
    const record = asRecord(item);
    if (!record) return null;
    const id = sanitizedCount(record.databaseId);
    const name = sanitizedText(record.workflowName ?? record.name);
    if (!id || !name) return null;
    const run: RepositoryWorkflowRun = {
      id,
      name,
      status: normalizedStatus(record.status),
    };
    const conclusion = sanitizedOptionalText(record.conclusion, 64);
    const url = sanitizedGithubUrl(record.url);
    const event = sanitizedOptionalText(record.event, 64);
    const headBranch = sanitizedOptionalText(record.headBranch, 255);
    const createdAt = sanitizedDate(record.createdAt);
    const updatedAt = sanitizedDate(record.updatedAt);
    if (conclusion) run.conclusion = conclusion.toLowerCase();
    if (url) run.url = url;
    if (event) run.event = event;
    if (headBranch) run.headBranch = headBranch;
    if (createdAt) run.createdAt = createdAt;
    if (updatedAt) run.updatedAt = updatedAt;
    runs.push(run);
  }
  return runs;
}

function countStatusRecords(output: string): number {
  const records = output.split("\0").filter(Boolean);
  let count = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    count += 1;
    if (
      ["R", "C"].includes(record[0] ?? "") ||
      ["R", "C"].includes(record[1] ?? "")
    ) {
      index += 1;
    }
  }
  return count;
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  retainChunk: (chunk: Uint8Array) => Uint8Array | null,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const retained = retainChunk(result.value);
    if (retained?.byteLength) chunks.push(retained);
  }
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

export const runRepositoryReviewProcess: RepositoryReviewProcessRunner =
  async ({ command, args, cwd, signal }) => {
    if (signal?.aborted) throw new RepositoryReviewProcessError("aborted");
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn({
        cmd: [command, ...args],
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          GH_PROMPT_DISABLED: "1",
          GH_PAGER: "cat",
          NO_COLOR: "1",
        },
      });
    } catch {
      throw new RepositoryReviewProcessError("missing");
    }

    let failure: ProcessFailureKind | undefined;
    let outputBytes = 0;
    const stop = (kind: ProcessFailureKind) => {
      if (failure) return;
      failure = kind;
      try {
        proc.kill();
      } catch {
        // The process may have exited between the signal and this cleanup.
      }
    };
    const timeout = setTimeout(
      () => stop("timeout"),
      REVIEW_PROCESS_TIMEOUT_MS,
    );
    const abort = () => stop("aborted");
    signal?.addEventListener("abort", abort, { once: true });
    const retainChunk = (chunk: Uint8Array): Uint8Array | null => {
      const remaining = REVIEW_PROCESS_OUTPUT_BYTES - outputBytes;
      outputBytes += chunk.byteLength;
      if (chunk.byteLength > remaining) {
        stop("output_limit");
        return remaining > 0 ? chunk.slice(0, remaining) : null;
      }
      return chunk;
    };

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        readBoundedStream(
          proc.stdout as ReadableStream<Uint8Array<ArrayBufferLike>>,
          retainChunk,
        ),
        readBoundedStream(
          proc.stderr as ReadableStream<Uint8Array<ArrayBufferLike>>,
          retainChunk,
        ),
        proc.exited,
      ]);
      if (failure) throw new RepositoryReviewProcessError(failure);
      return { stdout, stderr, exitCode };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  };

function degraded(
  local: RepositoryReviewLocalSummary,
  fetchedAt: string,
  reason: RepositoryReviewDegradedReason,
  detail: string,
  partial?: Partial<RepositoryReviewResult>,
): RepositoryReviewResult {
  return {
    state: "degraded",
    local,
    checks: partial?.checks ?? [],
    workflowRuns: partial?.workflowRuns ?? [],
    fetchedAt,
    ...partial,
    degraded: { reason, detail },
  };
}

function classifyFailure(
  failure: unknown,
  missingTool?: "git" | "gh",
): Pick<NonNullable<RepositoryReviewResult["degraded"]>, "reason" | "detail"> {
  if (failure instanceof RepositoryReviewProcessError) {
    if (failure.kind === "missing" && missingTool) {
      return missingTool === "git"
        ? {
            reason: "git_unavailable",
            detail: "Git is not installed or is not available on PATH.",
          }
        : {
            reason: "gh_unavailable",
            detail: "GitHub CLI is not installed or is not available on PATH.",
          };
    }
    if (failure.kind === "timeout") {
      return {
        reason: "timeout",
        detail: "Repository review commands did not finish within 8 seconds.",
      };
    }
    if (failure.kind === "output_limit") {
      return {
        reason: "malformed_response",
        detail: "Repository review output exceeded the 512 KB safety limit.",
      };
    }
  }
  return {
    reason: "malformed_response",
    detail: "Repository review data could not be read safely.",
  };
}

function looksLikeNoPullRequest(stderr: string): boolean {
  const message = stderr.toLowerCase();
  return (
    message.includes("no pull request") ||
    message.includes("no pull requests") ||
    message.includes("could not resolve to a pullrequest")
  );
}

function looksLikeNetworkFailure(stderr: string): boolean {
  const message = stderr.toLowerCase();
  return [
    "network",
    "connection",
    "could not resolve host",
    "dial tcp",
    "tls handshake",
    "timeout",
    "timed out",
    "http 5",
    "graphql",
  ].some((needle) => message.includes(needle));
}

function looksLikeAuthenticationFailure(stderr: string): boolean {
  const message = stderr.toLowerCase();
  return [
    "not logged in",
    "authentication",
    "requires authentication",
    "bad credentials",
    "http 401",
  ].some((needle) => message.includes(needle));
}

export class RepositoryReviewService {
  private readonly run: RepositoryReviewProcessRunner;
  private readonly now: () => Date;

  constructor(
    private readonly workspaceDir: string,
    options: RepositoryReviewServiceOptions = {},
  ) {
    this.run = options.run ?? runRepositoryReviewProcess;
    this.now = options.now ?? (() => new Date());
  }

  async review(signal?: AbortSignal): Promise<RepositoryReviewResult> {
    const fetchedAt = this.now().toISOString();
    let local: RepositoryReviewLocalSummary = {
      isRepository: false,
      ahead: 0,
      behind: 0,
      dirty: false,
      changedFiles: 0,
    };

    let rootResult: RepositoryReviewProcessResult;
    try {
      rootResult = await this.run({
        command: "git",
        args: ["rev-parse", "--show-toplevel"],
        cwd: this.workspaceDir,
        signal,
      });
    } catch (failure) {
      if (
        failure instanceof RepositoryReviewProcessError &&
        failure.kind === "missing"
      ) {
        return degraded(
          local,
          fetchedAt,
          "git_unavailable",
          "Git is not installed or is not available on PATH.",
        );
      }
      const classified = classifyFailure(failure, "git");
      return degraded(local, fetchedAt, classified.reason, classified.detail);
    }
    if (rootResult.exitCode !== 0) {
      return degraded(
        local,
        fetchedAt,
        "not_repository",
        "The selected workspace is not inside a Git repository.",
      );
    }

    const root = sanitizedText(rootResult.stdout, 4_096);
    if (!root) {
      return degraded(
        local,
        fetchedAt,
        "malformed_response",
        "Git did not return a usable repository root.",
      );
    }
    local = { ...local, isRepository: true, root };

    let results: RepositoryReviewProcessResult[];
    try {
      results = await Promise.all(
        [
          ["branch", "--show-current"],
          ["rev-parse", "--short", "HEAD"],
          ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
          ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
          ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
          ["remote", "get-url", "origin"],
        ].map((args) => this.run({ command: "git", args, cwd: root, signal })),
      );
    } catch (failure) {
      const classified = classifyFailure(failure, "git");
      return degraded(local, fetchedAt, classified.reason, classified.detail);
    }

    const [
      branchResult,
      headResult,
      upstreamResult,
      aheadBehindResult,
      statusResult,
      remoteResult,
    ] = results;
    const branch =
      branchResult?.exitCode === 0
        ? sanitizedOptionalText(branchResult.stdout, 255)
        : undefined;
    const head =
      headResult?.exitCode === 0
        ? sanitizedOptionalText(headResult.stdout, 64)
        : undefined;
    const upstream =
      upstreamResult?.exitCode === 0
        ? sanitizedOptionalText(upstreamResult.stdout, 255)
        : undefined;
    const [behindRaw, aheadRaw] =
      aheadBehindResult?.exitCode === 0
        ? aheadBehindResult.stdout.trim().split(/\s+/u)
        : [];
    const changedFiles =
      statusResult?.exitCode === 0
        ? countStatusRecords(statusResult.stdout)
        : 0;
    local = {
      isRepository: true,
      root,
      branch,
      head,
      upstream,
      ahead: Number.parseInt(aheadRaw ?? "0", 10) || 0,
      behind: Number.parseInt(behindRaw ?? "0", 10) || 0,
      dirty: changedFiles > 0,
      changedFiles,
    };

    const repository =
      remoteResult?.exitCode === 0 ? parseRemote(remoteResult.stdout) : null;
    if (!repository) {
      return degraded(
        local,
        fetchedAt,
        "unsupported_remote",
        "The origin remote is not a supported GitHub HTTPS or SSH repository.",
        { branch },
      );
    }
    if (!branch) {
      return degraded(
        local,
        fetchedAt,
        "no_pull_request",
        "The repository is detached or has no current branch to review.",
        { repository },
      );
    }

    try {
      const version = await this.run({
        command: "gh",
        args: ["--version"],
        cwd: root,
        signal,
      });
      if (version.exitCode !== 0) {
        return degraded(
          local,
          fetchedAt,
          "gh_unavailable",
          "GitHub CLI is installed but unavailable.",
          { repository, branch },
        );
      }
    } catch (failure) {
      if (
        failure instanceof RepositoryReviewProcessError &&
        failure.kind === "missing"
      ) {
        return degraded(
          local,
          fetchedAt,
          "gh_unavailable",
          "GitHub CLI is not installed or is not available on PATH.",
          { repository, branch },
        );
      }
      const classified = classifyFailure(failure, "gh");
      return degraded(local, fetchedAt, classified.reason, classified.detail, {
        repository,
        branch,
      });
    }

    let auth: RepositoryReviewProcessResult;
    try {
      auth = await this.run({
        command: "gh",
        args: ["auth", "status", "--hostname", repository.host],
        cwd: root,
        signal,
      });
    } catch (failure) {
      const classified = classifyFailure(failure, "gh");
      return degraded(local, fetchedAt, classified.reason, classified.detail, {
        repository,
        branch,
      });
    }
    if (auth.exitCode !== 0) {
      const network = looksLikeNetworkFailure(auth.stderr);
      return degraded(
        local,
        fetchedAt,
        network ? "network_error" : "not_authenticated",
        network
          ? "GitHub could not be reached."
          : "GitHub CLI is not authenticated for github.com.",
        { repository, branch },
      );
    }

    let prResult: RepositoryReviewProcessResult;
    let runsResult: RepositoryReviewProcessResult;
    try {
      [prResult, runsResult] = await Promise.all([
        this.run({
          command: "gh",
          args: [
            "pr",
            "view",
            branch,
            "--repo",
            repository.slug,
            "--json",
            "number,title,state,url,author,isDraft,reviewDecision,mergeStateStatus,headRefName,baseRefName,additions,deletions,changedFiles,comments,reviews,reviewRequests,labels,updatedAt,statusCheckRollup",
          ],
          cwd: root,
          signal,
        }),
        this.run({
          command: "gh",
          args: [
            "run",
            "list",
            "--branch",
            branch,
            "--repo",
            repository.slug,
            "--limit",
            "10",
            "--json",
            "databaseId,name,workflowName,status,conclusion,url,event,headBranch,createdAt,updatedAt",
          ],
          cwd: root,
          signal,
        }),
      ]);
    } catch (failure) {
      const classified = classifyFailure(failure, "gh");
      return degraded(local, fetchedAt, classified.reason, classified.detail, {
        repository,
        branch,
      });
    }

    const runsJson =
      runsResult.exitCode === 0 ? parseJsonArray(runsResult.stdout) : null;
    const workflowRuns = runsJson ? parseWorkflowRuns(runsJson) : null;
    if (runsResult.exitCode !== 0) {
      return degraded(
        local,
        fetchedAt,
        looksLikeNetworkFailure(runsResult.stderr)
          ? "network_error"
          : "malformed_response",
        looksLikeNetworkFailure(runsResult.stderr)
          ? "GitHub workflow runs could not be reached."
          : "GitHub workflow runs could not be read.",
        { repository, branch },
      );
    }
    if (!workflowRuns) {
      return degraded(
        local,
        fetchedAt,
        "malformed_response",
        "GitHub workflow run data was malformed.",
        { repository, branch },
      );
    }

    if (prResult.exitCode !== 0) {
      const noPullRequest = looksLikeNoPullRequest(prResult.stderr);
      const networkFailure = looksLikeNetworkFailure(prResult.stderr);
      const authenticationFailure = looksLikeAuthenticationFailure(
        prResult.stderr,
      );
      const reason: RepositoryReviewDegradedReason = noPullRequest
        ? "no_pull_request"
        : networkFailure
          ? "network_error"
          : authenticationFailure
            ? "not_authenticated"
            : "malformed_response";
      return degraded(
        local,
        fetchedAt,
        reason,
        noPullRequest
          ? "No pull request exists for the current branch."
          : networkFailure
            ? "GitHub pull request data could not be reached."
            : authenticationFailure
              ? "GitHub CLI authentication is no longer valid."
              : "GitHub pull request data could not be read.",
        { repository, branch, workflowRuns },
      );
    }
    const prJson = parseJsonRecord(prResult.stdout);
    const parsedPullRequest = prJson ? parsePullRequest(prJson) : null;
    if (!parsedPullRequest) {
      return degraded(
        local,
        fetchedAt,
        "malformed_response",
        "GitHub pull request or check data was malformed.",
        { repository, branch, workflowRuns },
      );
    }

    return {
      state: "ready",
      local,
      repository,
      branch,
      pullRequest: parsedPullRequest.pullRequest,
      checks: parsedPullRequest.checks,
      workflowRuns,
      fetchedAt,
    };
  }
}
