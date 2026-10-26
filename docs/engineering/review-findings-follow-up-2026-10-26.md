# Reliability review follow-up — October 26, 2026

This follows the [October 25 codebase review](codebase-review-2026-10-25.md).
All four findings have implementation or regression-test coverage in this change.
ElizaOS remains the engine for desktop and CLI; wallet/trading tools remain installed.

## 1. Durable automation retention

Terminal receipts move into indexed SQLite history, leaving active work and the
256 newest terminal receipts in the hot ledger. Historical fire/run lookup and
duplicate prevention survive restart. Superseded approvals are archived too;
retrieving an old result checks its original authorization.

Archive commits precede hot-ledger publication. Restart reconciles overlaps from
interrupted writes. Schema creation is transactional; empty first-creation
recovery is allowed only before persisted history is required. Missing, corrupt or conflicting required history refuses
new work instead of forgetting a fire identity. Tests exercise the former
5,000-record capacity, restart/replay, interrupted publication, original approval
lookup, and unavailable history. See [automation history](automation-history.md)
for storage limits and backup requirements. Cold history grows on disk; this is
not an unlimited-storage claim or a multi-day soak result.

## 2. Conversation recovery

The real compression command and native rollback helpers now have durable
failure-injection tests. The native-memory adapter is a controlled SQLite-backed
fixture; the projection uses the production SQLite message store and schema.

Seven journeys cover summary rejection before and after commit, partial native
deletion followed by rejection, a real SQLite trigger aborting projection insert,
failed compensation, successful compression, and cleanup of a failed replay
without deleting an unrelated message. The tests reopen both stores and inspect
persisted state. Failed compensation remains an explicit error, not a claimed
successful recovery. These are focused contract tests, not a complete Eliza SQL
adapter certification.

## 3. Bounded provider output

The shared provider subprocess runner caps combined stdout/stderr at 8 MiB by
default. Overflow stops the owned process and returns a nonzero `output_limit`
result. Truncated responses cannot become successful model answers. Tests cover
each stream separately, their combined budget, UTF-8, and invalid budgets.

## 4. Windows process trees and cancellation

Windows cancellation, deadlines and output overflow use the system `taskkill.exe`
with `/T /F`; POSIX uses the owned process group. Cleanup has a bounded Windows
termination attempt, and retained pipes cannot hold the request open forever.
Failed termination is reported explicitly and has a failure-injection test.
The executable comes from a fixed local-drive Windows system-directory allowlist;
nonstandard Windows system directories fail explicitly. Natural exit racing cleanup is handled
separately. Devin now forwards the SDK cancellation signal to its subprocess.

The process tests start a real launcher and a worker that holds inherited pipes,
then verify both stop on cancellation and deadline. A dedicated Windows PR job
runs these tests natively; Linux and macOS run the POSIX path. This is process
lifecycle control, not a security sandbox for hostile programs that deliberately
escape their process ancestry. If Windows tree termination fails, the request
reports that failure rather than claiming descendants stopped.

## Verification boundaries

The fast boundary suite, all workspace types, lint, architecture checks and
zero-production-advisory policy passed locally. Native source/desktop acceptance,
real linked-provider coding in each client, Windows process acceptance and
clean-HEAD packaged acceptance are distinct checks in the delivery workflow.
Their run results belong in the PR and completion report. A passing small coding
fixture does not establish long-task quality or reliability over weeks.

Seven dependency patches and three SDK compatibility workspaces remain. This
change addresses the four review findings; it does not remove those upstream
compatibility requirements.
