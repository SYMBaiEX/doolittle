# Doolittle Wow Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a code-backed product contract that turns the native operator research into measurable Doolittle acceptance scenarios and implementation tasks.

**Architecture:** Add a native runtime contract module that lists the operator-wow pillars, scenarios, gaps, and next tasks. Reuse the existing doc-truth sync pipeline so the public roadmap is generated from code and can fail checks when it drifts.

**Tech Stack:** Bun, TypeScript, ElizaOS-native Doolittle runtime records, existing `scripts/sync-doc-truth` generator, Bun tests.

---

## File Structure

- Create `packages/agent/src/runtime/native/operator-wow-contract.ts`: canonical code-backed contract records for Doolittle's native operator target.
- Create `packages/agent/src/runtime/native/operator-wow-contract.test.ts`: invariant tests that keep the contract complete and internally consistent.
- Modify `scripts/sync-doc-truth/render.ts`: render the operator-wow contract into Markdown.
- Modify `scripts/sync-doc-truth/sync.ts`: include `docs/operator-wow-contract.md` in doc-truth check/write mode.
- Modify `scripts/sync-doc-truth/render.test.ts`: cover the new renderer.
- Generate `docs/operator-wow-contract.md`: generated product contract and acceptance suite.
- Modify `README.md` and `docs/operator-loop.md`: point operators at the new generated contract.

## Task 1: Add The Code-Backed Contract

**Files:**
- Create: `packages/agent/src/runtime/native/operator-wow-contract.ts`
- Create: `packages/agent/src/runtime/native/operator-wow-contract.test.ts`

- [x] **Step 1: Write the contract module**

Create TypeScript interfaces for pillars, acceptance scenarios, and implementation tasks. Add eight pillars:

```ts
export type OperatorWowStatus = "covered" | "partial" | "missing";

export interface OperatorWowAcceptanceScenario {
  id: string;
  surface: string;
  trigger: string;
  requiredSignals: string[];
  verification: string[];
  currentStatus: OperatorWowStatus;
}
```

Each pillar must include at least two native operator signals, two ElizaOS leverage points, three Doolittle surfaces, two acceptance scenarios, two current gaps, and two implementation tasks.

- [x] **Step 2: Write invariant tests**

Add tests that assert:

```ts
expect(pillars).toHaveLength(8);
expect(scenarios).toHaveLength(16);
expect(tasks).toHaveLength(16);
```

Also assert all ids are unique and every scenario id starts with its pillar id.

- [x] **Step 3: Run the focused test**

Run:

```bash
bun test packages/agent/src/runtime/native/operator-wow-contract.test.ts
```

Expected: PASS with all contract invariant tests green.

## Task 2: Wire The Contract Into Doc Truth

**Files:**
- Modify: `scripts/sync-doc-truth/render.ts`
- Modify: `scripts/sync-doc-truth/sync.ts`
- Modify: `scripts/sync-doc-truth/render.test.ts`

- [x] **Step 1: Add the renderer**

Export `renderOperatorWowContract(records)` from `scripts/sync-doc-truth/render.ts`. The rendered Markdown must include:

```md
# Operator Wow Contract

## Product Thesis

## Summary
```

For each pillar, render research signals, ElizaOS leverage, acceptance scenarios, current gaps, and implementation tasks.

- [x] **Step 2: Add the sync target**

Import `listOperatorWowContract` in `scripts/sync-doc-truth/sync.ts` and add:

```ts
syncFile(
  root,
  mode,
  "docs/operator-wow-contract.md",
  renderOperatorWowContract(operatorWowContract),
)
```

- [x] **Step 3: Add renderer coverage**

Add a sample `OperatorWowContractPillar` in `scripts/sync-doc-truth/render.test.ts` and assert the output contains the pillar title, scenario id, task id, current status, and file list.

- [x] **Step 4: Run renderer tests**

Run:

```bash
bun test scripts/sync-doc-truth/render.test.ts scripts/sync-doc-truth/sync.test.ts
```

Expected: PASS.

## Task 3: Generate And Link The Contract

**Files:**
- Generate: `docs/operator-wow-contract.md`
- Modify: `README.md`
- Modify: `docs/operator-loop.md`

- [x] **Step 1: Generate docs**

Run:

```bash
bun run scripts/sync-doc-truth.ts --write
```

Expected: `docs/operator-wow-contract.md` is created and `Doc truth files updated.` is printed.

- [x] **Step 2: Link the contract from operator docs**

Add `docs/operator-wow-contract.md` to the canonical runtime docs list in `README.md` and the next-docs list in `docs/operator-loop.md`.

- [x] **Step 3: Check doc truth**

Run:

```bash
bun run scripts/sync-doc-truth.ts --check
```

Expected: no output differences and exit code 0.

## Task 4: Verify The Foundation Patch

**Files:**
- Verify: all files above

- [x] **Step 1: Run targeted tests**

Run:

```bash
bun test packages/agent/src/runtime/native/operator-wow-contract.test.ts scripts/sync-doc-truth/render.test.ts scripts/sync-doc-truth/sync.test.ts
```

Expected: PASS.

- [x] **Step 2: Run docs truth check**

Run:

```bash
bun run scripts/sync-doc-truth.ts --check
```

Expected: PASS.

- [x] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: shows only this plan, the operator-wow contract files, renderer/sync edits, generated docs, and pre-existing unrelated dirty files.

## Task 5: Next Execution Tranche

**Files:**
- Use: `docs/operator-wow-contract.md`
- Use: `packages/agent/src/runtime/native/operator-wow-contract.ts`

- [x] **Step 1: Pick the first product tranche**

Start with these tasks from the generated contract:

```text
first-run-decision-receipt
first-chat-readiness-contract
operator-command-surface
run-interrupt-contract
```

- [ ] **Step 2: Create a focused branch or worktree**

Because the current worktree is dirty, create the implementation tranche on an isolated branch or worktree before changing product runtime behavior.

- [ ] **Step 3: Execute with tests first**

For each task, write the failing test named in its definition of done before changing implementation files.
