# Desktop automation history

ElizaOS owns scheduling. The desktop records target-bot dispatch identities before
submitting runs, so retrying a scheduled fire cannot submit it twice.

The hot `bots/automation-dispatches.json` ledger and its backup keep active work
and the 256 most recently updated terminal receipts. Active work is never retired.
The existing limits of 5,000 hot fires, 2,000 hot approvals and 8 MB still refuse
excess simultaneous work rather than dropping it.

Completed, cancelled and failed receipts move into the private
`bots/automation-history.sqlite` archive. Indexed lookups by fire, run, and job/fire
identity retain duplicate protection across restarts without reading or rewriting
the entire history. The current approval per job and approvals referenced by hot
fires stay in the hot ledger; superseded approvals remain in the archive. Result
retrieval checks the original approval, never substitutes the current approval.

Archive inserts commit in one SQLite transaction before either hot JSON copy is
replaced. Restart reconciles overlapping records left by an interrupted write.
Both archive tables are created in one transaction. An interrupted, empty first
archive can be initialized only before the ledger requires history; an empty
required archive is never reset. Identity conflicts fail closed. A ledger that requires an archive refuses new
submissions if the archive is missing; a corrupt or symlinked archive also fails
closed. Existing version-one ledgers migrate on their next successful write.

Cold history is retained on disk indefinitely. It has no fixed row-count expiry;
this preserves the existing replay contract for arbitrary SDK fire identities.
Disk usage grows with actual dispatch history. This change bounds the frequently
rewritten state and keeps historical lookups indexed; it does not promise
unlimited storage or remove limits on concurrent active work.

For a consistent manual backup, stop the desktop/runtime and copy the complete
runtime `bots` state directory, including both JSON copies and the SQLite archive.
Do not delete or reset the archive to resolve a startup error: doing so discards
the evidence needed to prevent duplicate work. Restore a consistent backup or
investigate the storage failure.
