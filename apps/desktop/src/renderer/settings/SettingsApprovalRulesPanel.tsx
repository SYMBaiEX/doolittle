import { Input, NativeSelect } from "@doolittle/ui";
import { Plus, RefreshCw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  APPROVAL_RULE_PLATFORM_OPTIONS,
  APPROVAL_RULE_TEXT_SCOPES,
  type ApprovalRuleDraft,
  type ApprovalRulesResponse,
  approvalRuleDraftFromRule,
  approvalRuleRequestBodies,
  approvalRuleScopeSummary,
  approvalRuleStatus,
  type ExecutionApprovalRule,
  emptyApprovalRuleDraft,
  normalizeApprovalRule,
  normalizeApprovalRules,
} from "../approval-rules";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  type ActionFeedback,
  Badge,
  desktopRequest,
  displayTimestamp,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  useApiResource,
} from "../lib";
import { WorkConfirm } from "../work-surface/WorkSurface";
import {
  SETTINGS_SWITCH_CLASS,
  SETTINGS_SWITCH_INPUT_CLASS,
  SETTINGS_SWITCH_LABEL_CLASS,
  SETTINGS_SWITCH_TRACK_CLASS,
} from "./settings-layout";

interface EditorState {
  mode: "create" | "edit";
  ruleId?: string;
  rule?: ExecutionApprovalRule;
}

interface DeleteTarget {
  id: string;
  pattern: string;
}

const APPROVAL_RULES_PATH = "/execution/approval-rules";

function approvalRulePath(id: string): string {
  return `${APPROVAL_RULES_PATH}/${encodeURIComponent(id)}`;
}

export function SettingsApprovalRulesPanel({
  active,
  readOnly = false,
}: {
  active: boolean;
  readOnly?: boolean;
}) {
  const resource = useApiResource<ApprovalRulesResponse>(
    active ? APPROVAL_RULES_PATH : null,
    [active],
  );
  const rules = useMemo(
    () => normalizeApprovalRules(resource.data),
    [resource.data],
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<ApprovalRuleDraft>(emptyApprovalRuleDraft);
  const [busy, setBusy] = useState<"save" | "delete" | "">("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const patternRef = useRef<HTMLInputElement>(null);
  const newRuleButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const operationInFlightRef = useRef(false);
  const formId = useId();
  const feedbackId = `${formId}-feedback`;
  const enabledLabelId = `${formId}-enabled-label`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const editingRule =
    editor?.mode === "edit"
      ? (rules.find((rule) => rule.id === editor.ruleId) ?? editor.rule)
      : undefined;
  const inventoryReady = Boolean(resource.data);
  const canWrite = active && !readOnly && inventoryReady;
  const inputId = (name: string) => `${formId}-${name}`;

  const focusPatternInput = () => {
    window.setTimeout(() => {
      if (mountedRef.current)
        patternRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  const openCreateEditor = () => {
    if (!canWrite || operationInFlightRef.current) return;
    setEditor({ mode: "create" });
    setDraft(emptyApprovalRuleDraft());
    setDeleteTarget(null);
    setFeedback(null);
    focusPatternInput();
  };

  const openEditEditor = (rule: ExecutionApprovalRule) => {
    if (operationInFlightRef.current) return;
    setEditor({ mode: "edit", ruleId: rule.id, rule });
    setDraft(approvalRuleDraftFromRule(rule));
    setDeleteTarget(null);
    setFeedback(null);
  };

  const closeEditor = () => {
    if (operationInFlightRef.current) return;
    setEditor(null);
    setDeleteTarget(null);
    setFeedback(null);
  };

  const saveRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite || busy || operationInFlightRef.current || !editor) return;
    const bodies = approvalRuleRequestBodies(draft);
    if ("error" in bodies) {
      setFeedback({ tone: "bad", message: bodies.error });
      return;
    }
    const submittedEditor = editor;
    operationInFlightRef.current = true;
    setBusy("save");
    setFeedback(null);
    try {
      const editing = submittedEditor.mode === "edit" && submittedEditor.ruleId;
      const response = await desktopRequest<{ rule?: unknown }>(
        editing
          ? approvalRulePath(submittedEditor.ruleId ?? "")
          : APPROVAL_RULES_PATH,
        editing ? "PATCH" : "POST",
        editing ? bodies.patch : bodies.create,
      );
      if (!mountedRef.current) return;
      const savedRule = normalizeApprovalRule(response.rule);
      if (savedRule) {
        setEditor({ mode: "edit", ruleId: savedRule.id, rule: savedRule });
        setDraft(approvalRuleDraftFromRule(savedRule));
      }
      setFeedback({
        tone: "good",
        message: editing ? "Approval rule saved." : "Approval rule created.",
      });
      resource.reload();
    } catch (error) {
      if (mountedRef.current) {
        setFeedback({ tone: "bad", message: errorMessage(error) });
      }
    } finally {
      operationInFlightRef.current = false;
      if (mountedRef.current) setBusy("");
    }
  };

  const deleteRule = async (target: DeleteTarget) => {
    if (!canWrite || busy || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setBusy("delete");
    setFeedback(null);
    try {
      await desktopRequest(approvalRulePath(target.id), "DELETE");
      if (!mountedRef.current) return;
      setDeleteTarget(null);
      setEditor((current) =>
        current?.mode === "edit" && current.ruleId === target.id
          ? null
          : current,
      );
      setFeedback({ tone: "good", message: "Approval rule deleted." });
      resource.reload();
      window.setTimeout(() => {
        if (mountedRef.current)
          newRuleButtonRef.current?.focus({ preventScroll: true });
      }, 0);
    } catch (error) {
      if (mountedRef.current) {
        setFeedback({ tone: "bad", message: errorMessage(error) });
      }
    } finally {
      operationInFlightRef.current = false;
      if (mountedRef.current) setBusy("");
    }
  };

  const updateDraft = <Key extends keyof ApprovalRuleDraft>(
    key: Key,
    value: ApprovalRuleDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const platformKnown = APPROVAL_RULE_PLATFORM_OPTIONS.some(
    (platform) => platform === draft.platform,
  );

  return (
    <WorkbenchSection
      actions={
        <>
          <WorkbenchAction
            aria-label="Reload approval rules"
            disabled={!active || resource.loading}
            emphasis="quiet"
            icon={RefreshCw}
            onClick={resource.reload}
          >
            Reload
          </WorkbenchAction>
          <WorkbenchAction
            disabled={!canWrite || Boolean(busy)}
            emphasis="primary"
            icon={Plus}
            onClick={openCreateEditor}
            ref={newRuleButtonRef}
          >
            New rule
          </WorkbenchAction>
        </>
      }
      busy={resource.isValidating || Boolean(busy)}
      className="settings-workbench-section approval-rules-section"
      description="Persistent exact and prefix command allowances. Rules are allow-only; every scope you set narrows where they apply."
      icon={ShieldCheck}
      title="Approval rules"
    >
      {feedback ? (
        <Notice id={feedbackId} tone={feedback.tone}>
          {feedback.message}
        </Notice>
      ) : null}
      {resource.loading && !resource.data ? (
        <LoadingBlock label="Loading approval rules…" />
      ) : null}
      {resource.error ? (
        <ErrorBlock
          detail={resource.errorDetail}
          error={resource.error}
          retry={resource.reload}
          title="Couldn't load approval rules."
        />
      ) : null}
      {!resource.loading && inventoryReady && rules.length === 0 && !editor ? (
        <WorkbenchEmpty
          actions={
            canWrite ? (
              <WorkbenchAction icon={Plus} onClick={openCreateEditor}>
                Create the first rule
              </WorkbenchAction>
            ) : undefined
          }
          icon={ShieldCheck}
          title="No approval rules"
        >
          Approval rules allow matching future commands without another one-time
          prompt. Create one only for commands you trust in the selected scope.
        </WorkbenchEmpty>
      ) : null}
      {rules.length ? (
        <ul aria-label="Saved approval rules" className="approval-rules-list">
          {rules.map((rule) => {
            const status = approvalRuleStatus(rule);
            return (
              <li className="approval-rules-list__item" key={rule.id}>
                <button
                  aria-current={
                    editor?.mode === "edit" && editor.ruleId === rule.id
                      ? "true"
                      : undefined
                  }
                  className="approval-rule-row"
                  disabled={Boolean(busy)}
                  onClick={() => openEditEditor(rule)}
                  type="button"
                >
                  <span className="approval-rule-row__command">
                    <code>{rule.pattern}</code>
                  </span>
                  <span className="approval-rule-row__meta">
                    <span>
                      {rule.patternType === "exact"
                        ? "Exact command"
                        : "Prefix with whitespace boundary"}
                    </span>
                    <span>{approvalRuleScopeSummary(rule)}</span>
                    <span>
                      {rule.expiresAt
                        ? `Expires ${displayTimestamp(rule.expiresAt)}`
                        : "No expiry"}
                    </span>
                  </span>
                  <span className="approval-rule-row__status">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {editor ? (
        <form
          aria-busy={busy === "save"}
          aria-describedby={feedback ? feedbackId : undefined}
          className="approval-rule-editor"
          onSubmit={(event) => void saveRule(event)}
        >
          <div className="approval-rule-editor__heading">
            <div>
              <h3>
                {editor.mode === "create"
                  ? "New approval rule"
                  : "Edit approval rule"}
              </h3>
              <p>
                Patterns are literal and case-sensitive. Prefix rules match the
                exact prefix or text followed by whitespace, never a longer
                word.
              </p>
            </div>
            {editor.mode === "edit" && editor.ruleId ? (
              <code>{editor.ruleId}</code>
            ) : null}
          </div>
          <div className="approval-rule-form-grid">
            <label
              className="approval-rule-field approval-rule-field--wide"
              htmlFor={inputId("pattern")}
            >
              <span>Command pattern</span>
              <Input
                autoComplete="off"
                disabled={Boolean(busy) || !canWrite}
                id={inputId("pattern")}
                maxLength={1_000}
                placeholder="git commit"
                ref={patternRef}
                required
                value={draft.pattern}
                onChange={(event) => updateDraft("pattern", event.target.value)}
              />
              <small>Leading and trailing whitespace is trimmed.</small>
            </label>
            <label className="approval-rule-field" htmlFor={inputId("match")}>
              <span>Match type</span>
              <NativeSelect
                disabled={Boolean(busy) || !canWrite}
                id={inputId("match")}
                value={draft.patternType}
                onChange={(event) =>
                  updateDraft(
                    "patternType",
                    event.target.value === "prefix" ? "prefix" : "exact",
                  )
                }
              >
                <option value="exact">Exact command</option>
                <option value="prefix">Command prefix</option>
              </NativeSelect>
              <small>
                Exact matches the whole command; prefix requires a whitespace
                boundary.
              </small>
            </label>
            <label className="approval-rule-field" htmlFor={inputId("expires")}>
              <span>Expires at</span>
              <Input
                disabled={Boolean(busy) || !canWrite}
                id={inputId("expires")}
                step={1}
                type="datetime-local"
                value={draft.expiresAtLocal}
                onChange={(event) =>
                  updateDraft("expiresAtLocal", event.target.value)
                }
              />
              <small>Local time. Leave blank for no expiry.</small>
            </label>
            <label
              className="approval-rule-field"
              htmlFor={inputId("platform")}
            >
              <span>Platform</span>
              <NativeSelect
                disabled={Boolean(busy) || !canWrite}
                id={inputId("platform")}
                value={draft.platform}
                onChange={(event) =>
                  updateDraft("platform", event.target.value)
                }
              >
                <option value="">Any platform</option>
                {draft.platform && !platformKnown ? (
                  <option value={draft.platform}>
                    {draft.platform} (unavailable)
                  </option>
                ) : null}
                {APPROVAL_RULE_PLATFORM_OPTIONS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </NativeSelect>
              <small>Optional narrowing scope.</small>
            </label>
          </div>
          <fieldset className="approval-rule-scope-fields">
            <legend>Scope narrowing</legend>
            <p>
              Blank fields stay broad. Set only the identities this command
              allowance should be limited to; rules never include a run ID.
            </p>
            <div>
              {APPROVAL_RULE_TEXT_SCOPES.map(([key, label]) => (
                <label
                  className="approval-rule-field"
                  htmlFor={inputId(key)}
                  key={key}
                >
                  <span>{label}</span>
                  <Input
                    autoComplete="off"
                    disabled={Boolean(busy) || !canWrite}
                    id={inputId(key)}
                    maxLength={256}
                    value={draft[key]}
                    onChange={(event) => updateDraft(key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <label className={SETTINGS_SWITCH_CLASS} htmlFor={inputId("enabled")}>
            <input
              aria-labelledby={enabledLabelId}
              checked={draft.enabled}
              className={SETTINGS_SWITCH_INPUT_CLASS}
              disabled={Boolean(busy) || !canWrite}
              id={inputId("enabled")}
              type="checkbox"
              onChange={(event) => updateDraft("enabled", event.target.checked)}
            />
            <i className={SETTINGS_SWITCH_TRACK_CLASS} aria-hidden="true" />
            <span className={SETTINGS_SWITCH_LABEL_CLASS} id={enabledLabelId}>
              {draft.enabled ? "Enabled" : "Disabled"}
            </span>
          </label>
          <div className="approval-rule-actions">
            <WorkbenchAction
              disabled={!canWrite || Boolean(busy) || !draft.pattern.trim()}
              emphasis="primary"
              icon={Save}
              type="submit"
            >
              {busy === "save"
                ? "Saving…"
                : editor.mode === "create"
                  ? "Create rule"
                  : "Save rule"}
            </WorkbenchAction>
            <WorkbenchAction
              disabled={Boolean(busy)}
              emphasis="quiet"
              icon={X}
              onClick={closeEditor}
            >
              Cancel
            </WorkbenchAction>
            {editor.mode === "edit" && editingRule ? (
              <WorkbenchAction
                disabled={!canWrite || Boolean(busy)}
                emphasis="danger"
                icon={Trash2}
                onClick={() =>
                  setDeleteTarget({
                    id: editingRule.id,
                    pattern: editingRule.pattern,
                  })
                }
                ref={deleteButtonRef}
              >
                Delete rule
              </WorkbenchAction>
            ) : null}
          </div>
          {deleteTarget ? (
            <WorkConfirm
              cancelDisabled={busy === "delete"}
              confirmDisabled={busy === "delete" || !canWrite}
              confirmLabel={busy === "delete" ? "Deleting…" : "Delete rule"}
              detail={
                <>
                  Delete the rule for “{deleteTarget.pattern}”? Future matching
                  commands will require approval again. This cannot be undone.
                </>
              }
              onCancel={() => setDeleteTarget(null)}
              onConfirm={() => void deleteRule(deleteTarget)}
              returnFocusRef={deleteButtonRef}
              title="Delete approval rule?"
            />
          ) : null}
        </form>
      ) : null}
    </WorkbenchSection>
  );
}
