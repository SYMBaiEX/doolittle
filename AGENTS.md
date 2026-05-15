<claude-mem-context>
# Memory Context

# [doolittle] recent context, 2026-05-14 8:15pm CDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (22,866t read) | 2,242,750t work | 99% savings

### May 9, 2026
2974 5:10p 🔵 Doolittle Uses ElizaOS Alpha (2.0.0-alpha.537) While Public Latest is 1.7.2
2975 " 🔵 Hermes Architecture: 7-Subsystem Monolith with SQLite Session Store and 70+ Tools Across 28 Toolsets
2977 5:59p 🔵 Superpowers Writing-Plans Skill: Structure and Requirements
2978 " 🔵 Superpowers Executing-Plans Skill: Workflow Integration
2980 6:00p 🔵 Doolittle Project: Current State and Parity Ledger
2984 6:01p 🔵 Doolittle Capability-Truth System: Code-Backed Doc Generation Architecture
2988 6:03p 🟣 Doolittle Operator Wow Contract: Code-Backed Product Acceptance Pillars
2990 " 🟣 Operator Wow Contract Test Suite with Scenario Count Correction
2992 6:04p 🟣 renderOperatorWowContract() Added to Doc-Truth Render Pipeline
2995 " 🟣 Operator Wow Contract Wired into Doc-Truth CI Pipeline and Generated
2998 6:05p 🟣 Doolittle Wow Harness Implementation Plan Document Created
3003 6:07p 🟣 Bootstrap Check Mode Now Outputs Explicit File-Level Dry-Run Receipt
3004 " 🔵 Doolittle Git Status: Large Plugin Consolidation in Progress
3009 6:08p ✅ Full Test Suite Passes: 1375 Tests, 0 Failures After Wow Contract Work
3013 6:09p ✅ First-Run Contract Task Refined: first-run-wow-smoke → first-run-decision-receipt
3017 6:12p 🔵 ElizaOS Local Model Plugin Availability: Ollama Present, Llama 404
3061 6:39p ⚖️ Doolittle: Switch Default Ollama Model to Granite 4.1
3062 6:41p ✅ Doolittle: Global Model Rename qwen3:1.7b → granite4.1:3b Across All Files
3063 " 🔵 Granite 4.1 3B: Technical Specs Confirmed on Apple M5 Pro via Ollama
3064 " ✅ Doolittle: Ollama Promoted to Primary Default Provider in README and Docs
3067 6:43p ✅ Doolittle Granite 4.1 Migration: All Quality Gates Green
3068 6:59p 🔵 Doolittle Ollama Provider: Not Selected on Boot — Falls Back to Codex
3071 " 🔵 Doolittle Root Cause: .doolittle/settings.json Hardcodes "codex" Provider — Ollama Never Selected
3072 " 🔵 TEXT_EMBEDDING Handler Gap: plugin-local-embedding Exists But Is Never Loaded in Provider Stack
3073 " 🔵 Doolittle Provider Determination Architecture: settings.json → SettingsService → plugin-registry → runtime
3081 7:04p 🔵 DOOLITTLE_USE_LINKED_CODEX_AUTH=true in .env Forces Codex as Default and Triggers Fallback Override
3082 " 🔵 @elizaos/plugin-ollama v2.0.0-alpha.537 Fully Covers TEXT_EMBEDDING — No Local Embedding Plugin Needed
3083 " ⚖️ Ollama Fix Plan: Three-Part Change Required Across .env, cloud-bootstrap.ts, and plugin-settings
3110 7:47p 🔵 Doolittle install.sh Post-Install Flow and Available Commands
3114 7:49p 🔵 Doolittle Turn Classification System: Four Capability Profiles and Multi-Step Policy
3115 " 🔵 Doolittle Plugin Assembly Architecture: Initial vs Deferred Plugin Groups
3116 " 🔵 Doolittle EnvConfig Schema: Full Environment Variable Defaults and Structure
3117 7:52p 🔵 Doolittle TurnState Architecture: Session/Room ID Derivation and CLI Detection
3118 7:54p 🟣 Simple Chat Model Fast Path: handleSimpleChatModelTurn Bypasses Full Provider Runtime
3119 7:57p 🟣 Simple Chat Fast Path Confirmed Live: 890ms Response via TEXT_SMALL Direct Model Call
3120 " 🔴 install.sh Bash Compatibility Shim: Re-execs with bash if Invoked from sh
3121 " 🟣 Ollama ACTION_PLANNER Token Budget Capped at 160; keep_alive Set to "10m"
3122 " 🔴 Test Mock Fixed: runController.finishTurn Missing from createContext() Stub
3123 8:01p 🟣 Direct Informational Fast Path Validated: Architecture Question Answered in 1.2s vs Previous 34s
### May 13, 2026
3685 9:57p ⚖️ Doolittle Ollama Glue — SDK-Native Cleanup Scope Defined
3686 " 🔵 Doolittle Trajectory System — Full File Surface Map
3687 10:00p 🔵 Doolittle Ollama Provider Architecture — Full Surface Map
3688 " 🔵 @elizaos/plugin-ollama 2.0.0-alpha.537 — Full Capability Map vs Doolittle Custom Layer
3689 " 🔵 ElizaOS Model Registration Priority — First-Registered Wins at Equal Priority
3690 " 🔵 @elizaos/plugin-local-embedding — Workspace Package Still Referenced, Not Used for Inference
3691 " 🔵 Doolittle OLLAMA_* Env Var Forwarding — Plugin Settings Bridge for SDK Plugin Compatibility
3692 " 🔵 ElizaOS SDK Trajectory API Surface — Full Confirmed Map from node_modules
3693 " ⚖️ Trajectory Cleanup Strategy — SDK Bridge vs Local JSONL Are Separate Layers
3694 10:03p ⚖️ Doolittle Trajectory — SDK Integration Scope and Architecture Defined
3695 10:09p ⚖️ Doolittle SDK-Native Cleanup — Subagent Scope and File Ownership Defined

Access 2243k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
