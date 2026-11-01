# Local path alert review

Scope: 69 `js/path-injection` alerts in `packages/agent/src`, excluding
`cli/jobs`, secret-salt/settings-service, and test files. Per-alert reasons and
caller evidence are in `triage/local-paths.json`: 3 fixed, 66 intentional-local.
These classifications are source-review dispositions, not GitHub dismissals or
proof that a fresh CodeQL run has closed the alerts.

## Confirmed automatic prompt-file escape

Workspace command directories/files and `AGENTS.md`, `SOUL.md`, `MISSION.md`,
and `ROADMAP.md` are repository-controlled data, not operator-selected arbitrary
host-file capabilities. External symlinks previously let those automatic reads
import unrelated host content into model prompts. Alerts 58–60 cover workflow
discovery; the same narrow boundary was repaired in ContextFilesService so the
automatic context path did not remain an equivalent bypass.

Both readers now canonicalize the selected workspace and candidate, require a
strict descendant using relative-path containment (including sibling-prefix
rejection), then read the canonical target as a bounded regular file through
the shared descriptor reader. The final entry is opened with `O_NOFOLLOW` where
the runtime supports it. In-workspace symlinks, including a symlink-selected
workspace root, remain supported. Each automatic markdown input is capped at
1 MiB. Invalid/oversized/nonregular workflow files are ignored, retaining
built-in fallback; context files become blocked diagnostic entries and are
excluded from rendered model context even when injection scanning is disabled.

Historical validation: 17 tests passed in 3 files at this remediation revision.
Those fixtures were later retired with the legacy test corpus; the new core
suite is not a repeat of this filesystem regression evidence.

```sh
# Historical command (requires the remediation revision, not current HEAD):
nub run test:scope packages/agent/src/runtime/workspace-prompt-containment.test.ts packages/agent/src/runtime/workflow-commands.test.ts packages/agent/src/services/context-files-service.test.ts
```

Coverage includes normal load/prompt expansion, external file and directory
links, sibling-prefix roots, internal links, missing workspaces, built-in
fallback, oversize/nonregular inputs, deterministic final-entry symlink swaps,
blocked context diagnostics, and recovery after replacing a blocked link.

## Intended operator path capabilities

| Operational path                      | Authority and constraints                                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/service storage               | Launch environment becomes EnvConfig; service assembly selects fixed child directories and basenames. Message/user/account IDs remain JSON or SQL fields. Explicit absolute/external storage roots remain supported.                                                |
| Gateway storage                       | Startup gatewayDataDir feeds fixed config/session/approval/delivery names. Gateway messages do not change these roots.                                                                                                                                              |
| Local CLI onboarding/version          | Operator repo/data/PGLite overrides select source runtime locations. Reads append fixed file names; onboarding argument text does not select those file paths.                                                                                                      |
| Provider auth/model cache             | Operator HOME/CODEX_HOME/data roots select fixed credential/cache basenames. Account routes do not accept a home override. Official SDK account storage and existing atomic JSON helpers remain in use.                                                             |
| Shell/executable discovery            | SHELL/ComSpec/PATH/PATHEXT are launch configuration; command text is separate. Automatic account probes use fixed provider command names and ignore DEVIN_CLI_COMMAND. This is local executable authority, not merely a claim that shell:false is universally safe. |
| Project inspection/trajectory imports | Explicit local project/manifest file capabilities intentionally support targets outside the active workspace; they are not a host sandbox. Flagged trajectory listing itself uses configured service state.                                                         |
| Eval metrics                          | Explicit opt-in capture flag plus configured data root and fixed filename; timing/token-count arguments never select the output path.                                                                                                                               |

Desktop backend launch fixes private data/DB/service roots. Worker launch assigns
private HOME/CODEX_HOME and skips repository dotenv. This pass traced those
source paths but did not launch a native desktop/worker to certify live policy.

## Residual risk and recovery

- Canonical checks and a pinned final descriptor do **not** prevent a malicious
  concurrent writer from replacing ancestor directories. Race-free ancestry
  confinement requires a stronger OS/filesystem boundary; it is not claimed by
  this change. Keep sensitive storage and automatic context roots protected
  from untrusted concurrent writers.
- `O_NOFOLLOW` behavior and symlink semantics need native validation on other
  supported platforms, particularly runtimes where that constant is absent.
  The focused tests passed on the current macOS host; Windows assurance is not
  inferred from those results.
- Local launch-environment, dependency/executable, or configured storage
  compromise remains high-impact existing authority. No root configuration is
  silently rewritten or confined to a new directory.
- To recover blocked content, replace an external link/nonregular/oversized
  file with a readable in-workspace markdown file within the 1 MiB bound. This
  path is regression-tested and preserves built-in workflows.
- No persisted state/schema changed. A source rollback is possible, but would
  reopen the automatic external-file prompt import; prefer correcting content
  location/size over removing the guard.

These focused results do not certify a native platform run or fresh GitHub
CodeQL closure. Combined branch validation and remaining scan/release limits
are recorded in [the full review](README.md).
