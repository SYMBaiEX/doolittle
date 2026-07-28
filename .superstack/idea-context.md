# Doolittle desktop product context

## Idea

Doolittle is an ElizaOS-native desktop and terminal agent. The desktop should
feel repo-native: local repositories are durable projects, project chats retain
shared instructions and sources, and the private runtime executes in the
selected repository.

## Landscape

Research date: 2026-07-27

- Codex and T3 Code make a local repository the project unit and attach task
  threads to it.
- Claude Code treats the current working directory as the implicit project and
  resumes sessions within that directory.
- ChatGPT Desktop and Claude Desktop treat Projects as durable homes for chats,
  instructions, files, and knowledge.
- Hermes Agent Desktop exposes the fullest hierarchy:
  project → repository/folder → worktree/lane → session.
- Doolittle should combine the repo authority of Codex/T3/Claude Code, the
  durable context of ChatGPT/Claude Projects, and the compact sidebar hierarchy
  of Hermes.

## Product decision

Projects are local repositories. New chat opens a project picker; selecting a
new folder creates or reopens its project. The conversation sidebar groups chat
history under expandable project rows with inline new-chat actions. A General
scope remains available for deliberately detached conversations.

## Sources

- https://openai.com/codex/get-started/
- https://openai.com/academy/working-with-codex/
- https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- https://docs.anthropic.com/en/docs/claude-code/cli-usage
- https://support.anthropic.com/en/articles/9519177-how-can-i-create-and-manage-projects
- https://github.com/nousresearch/hermes-agent/tree/main/apps/desktop
- https://github.com/pingdotgg/t3code

## Changelog parity wave

Research date: 2026-07-27

direct_competitors:

- Codex desktop and CLI
- Claude Code
- Hermes Agent Desktop
- T3 Code

adjacent_competitors:

- ChatGPT Desktop
- Claude Desktop and Cowork

current_market_signals:

- Multi-folder repository projects with an explicit primary workspace
- Unified recents, pinning, and search across chats, projects, and files
- Per-thread drafts, durable background work, and recovery-safe resume
- Visible subagent, tool, context, diff, and approval state
- Integrated MCP, plugins, models, providers, skills, and automations
- Voice, detached windows, session branching, imports, and remote continuity

integrated_in_this_wave:

- Persistent per-session chat drafts
- Persistent queued follow-ups restored in a paused state
- Durable pinned conversations in project history
- Project-scoped and General prompt library
- Read-aloud controls and IME-safe global chat shortcuts
- Primary-folder selection for multi-folder projects
- Global search across projects and project sources
- Actionable high-context compression control
- Read-only MCP health, probe, cached tool search, and detail panel
- Durable conversation forks for fork, edit, and retry with transcript lineage
- Versioned native session archive export, preview, and atomic import
- Managed microphone dictation with explicit record, stop, cancel, and review
- Bounded local activity inbox for chat runs, automations, delegated tasks,
  approvals, and deliveries

deliberately_deferred:

- Realtime bidirectional conversational voice beyond managed dictation
- Vendor-specific competitor settings and session import adapters
- Detached Electron conversation windows
- Routed operating-system notifications
- Cloud and mobile sync or remote SSH execution

parity_report:

- docs/research/competitor-changelog-parity-2026-07-27.html
