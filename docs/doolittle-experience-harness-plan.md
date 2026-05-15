# Doolittle Native Experience Harness Plan

## Goal

Make Doolittle feel like a warm, persistent, terminal-native ElizaOS collaborator with strong local execution, visible control, memory, skills, recovery, and research-grade trajectories.

## Operator Patterns Worth Keeping

- **Live operator loop**: the terminal should feel alive with status bars, spinners, tool previews, approvals, interrupts, `/retry`, `/undo`, `/usage`, `/compress`, and model controls.
- **Closed learning loop**: memory, todos, skills, session search, and trajectory export should behave like one workflow rather than separate panels.
- **Execution contracts**: Doolittle should not trust the model's summary when tools were supposed to act. The loop tracks tool results, repeated failures, empty responses, and file-mutation proof before presenting a turn as successful.
- **One command grammar**: CLI, TUI, gateway, and autocomplete derive from the same command registry.
- **Platform continuity**: Gateway conversations can resume, route home, approve commands, and preserve session context.
- **Research readiness**: Trajectories are first-class artifacts for compression, replay, batch generation, evaluation, and future small-model training.

## Doolittle Direction

Doolittle should use ElizaOS as the native substrate and make the harness feel alive by tightening the experience spine:

- **ElizaOS-native identity**: character, personality, memory, and runtime services shape every model path.
- **Terminal-first recovery**: `/retry`, `/undo`, `/todo`, `/usage`, `/compress`, `/status`, and `/doctor` stay available inside the chat loop.
- **Tool use with receipts**: every local action records progress and trajectory events without drowning the user in logs.
- **Local-first providers**: Devin, Ollama, Codex, Claude Code, and ElizaCloud are selectable providers, but local/non-cloud status must be truthful.
- **Training harness**: trajectory records include conversation, model request/response, tool lifecycle, shell output, failures, timings, and final receipts.

## Implemented In This Slice

- Local execution turns now have a Doolittle-side execution contract: local action requests must produce observable action proof, and file-mutation requests cannot complete with zero local actions.
- Empty planner wrappers such as `Provider executed: []` are now classified as native execution failures for local tasks instead of being treated as successful answers.
- Local file actions now record mutation receipts for `WRITE_FILE`, `PATCH_FILE`, and `CREATE_DIRECTORY` into the active run controller state.
- File-writing requests now require a successful write or patch receipt before Doolittle can present the turn as complete.
- Mutation receipts flow into run progress and ElizaOS SDK trajectory logging so future training data can distinguish real local changes from summaries; Doolittle debug bundles remain non-training replay artifacts.
- Coding profile guidance now names Doolittle's actual Eliza actions (`READ_FILE`, `WRITE_FILE`, `PATCH_FILE`, `SEARCH_FILES`, `CREATE_DIRECTORY`, `RUN_IN_TERMINAL`) instead of only abstract coding-agent capabilities.
- `/retry` replays the latest real conversational turn after removing its previous answer, without storing `/retry` as the prompt.
- `/undo` removes the latest conversational exchange from session memory.
- `/todo list`, `/todo add`, and `/todo show` alias Doolittle's native planning service for Doolittle-native task tracking.
- Provider-path model input now includes a Doolittle experience contract: warm Eliza-style presence, memory continuity, visible todos for multi-step work, and truthful execution receipts.
- Command catalog and help examples advertise the recovery and todo loop.
- `/compress [focus]` now compresses the active conversation session; trajectory dataset compression moved to `/trajectories compress`.
- `/model list` and `/model use <provider> [model]` provide a coherent operator-facing model route surface across Ollama, Devin, Codex, Claude Code, and Eliza Cloud.
- `/usage` and `/insights` now summarize context pressure, observed run/tool events, memory, generated skills, and next controls instead of raw JSON.
- `/skills synthesize latest` creates a generated skill from the active session when a reusable workflow is detected.
- User profile observations now opportunistically write new names, facts, and preferences into user memory for stronger recall.
- `doolittle-experience` benchmark pack covers the small-talk, memory, CLI recovery, model switching, coding, gateway, and learning-loop native experience path.

## Next Todo

1. Add tool-loop guardrails for repeated identical failures, repeated no-progress retrieval, and planner empty-response retries.
2. Add a compact live status footer for plain shell mode: provider/model, elapsed turn time, context pressure, active tool, and last trajectory event.
3. Add gateway native-behavior checks for typing/progressive delivery, approvals, home routing, voice memo routing, and session continuity.
4. Add cost/rate-limit accounting when the active provider exposes token or quota metadata.
5. Add an interactive model picker UI on top of the `/model list` and `/model use` command contract.
