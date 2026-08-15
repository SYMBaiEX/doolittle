import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { Textarea } from "@elizaos/ui/components/ui/textarea";
import type { FormEvent } from "react";
import type {
  AutomationActionChoice,
  AutomationConditionChoice,
  AutomationDraft,
  AutomationTriggerChoice,
} from "../automation-model";
import {
  AUTOMATION_BUILDER_CLASS,
  AUTOMATION_BUILDER_FOOTER_CLASS,
  AUTOMATION_BUILDER_GRID_CLASS,
  AUTOMATION_BUILDER_HEADER_CLASS,
  AUTOMATION_BUILDER_SECTION_CLASS,
  AUTOMATION_CHOICE_BUTTON_CLASS,
  AUTOMATION_CHOICE_GRID_CLASS,
  AUTOMATION_CHOICE_SELECTED_CLASS,
  AUTOMATION_FIELD_CONTROL_CLASS,
  AUTOMATION_FIELD_LABEL_CLASS,
  AUTOMATION_SECTION_HEADING_CLASS,
} from "./layout";

function ChoiceButtons({
  choices,
  selected,
  onSelect,
  label,
}: {
  choices: Array<[string, string]>;
  selected: string;
  onSelect(value: string): void;
  label: string;
}) {
  return (
    <fieldset className="automation-choice-fieldset m-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div className={AUTOMATION_CHOICE_GRID_CLASS}>
        {choices.map(([value, label]) => (
          <button
            aria-pressed={selected === value}
            className={`${AUTOMATION_CHOICE_BUTTON_CLASS} ${selected === value ? AUTOMATION_CHOICE_SELECTED_CLASS : ""}`}
            key={value}
            onClick={() => onSelect(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function AutomationBuilder({
  busy,
  draft,
  onSubmit,
  onUpdate,
}: {
  busy: boolean;
  draft: AutomationDraft;
  onSubmit(event: FormEvent): void;
  onUpdate<Key extends keyof AutomationDraft>(
    key: Key,
    value: AutomationDraft[Key],
  ): void;
}) {
  const triggerHelp =
    draft.triggerType === "schedule"
      ? "Runs on a 5-field cron or interval such as every 30m."
      : draft.triggerType === "manual"
        ? "Runs only when you press Run now."
        : "A private local webhook path is generated after save.";
  const conditionHelp =
    draft.conditionType === "always"
      ? "Every accepted trigger continues to the action."
      : draft.conditionType === "exists"
        ? "Checks whether a payload field is present."
        : "Checks a payload field before the action runs.";
  const actionHelp =
    draft.actionType === "webhook"
      ? "Sends a JSON POST without stored authorization headers."
      : "The prompt is stored with the workflow and added to each run trace.";

  return (
    <form className={AUTOMATION_BUILDER_CLASS} onSubmit={onSubmit}>
      <div className={AUTOMATION_BUILDER_HEADER_CLASS}>
        <div>
          <span className="eyebrow">Workflow builder</span>
          <h2>When this happens, decide, then act</h2>
        </div>
        <label
          className={`automation-name-field ${AUTOMATION_FIELD_LABEL_CLASS}`}
          htmlFor="automation-name"
        >
          <span>Name</span>
          <Input
            id="automation-name"
            value={draft.name}
            onChange={(event) => onUpdate("name", event.target.value)}
            placeholder="Release readiness"
          />
        </label>
      </div>

      <fieldset className="automation-builder__fieldset m-0 border-0 p-0">
        <legend className="sr-only">Automation definition</legend>
        <div className={AUTOMATION_BUILDER_GRID_CLASS}>
          <section className={AUTOMATION_BUILDER_SECTION_CLASS}>
            <div className={AUTOMATION_SECTION_HEADING_CLASS}>
              <strong>Trigger</strong>
              <small>Starts the workflow</small>
            </div>
            <div className="automation-builder__field grid gap-1.5">
              <span className="text-[11px] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
                Start when
              </span>
              <ChoiceButtons
                choices={[
                  ["schedule", "Schedule"],
                  ["manual", "Manual"],
                  ["webhook", "Webhook"],
                ]}
                label="Choose a trigger"
                selected={draft.triggerType}
                onSelect={(value) =>
                  onUpdate("triggerType", value as AutomationTriggerChoice)
                }
              />
            </div>
            {draft.triggerType === "schedule" ? (
              <label
                className={AUTOMATION_FIELD_LABEL_CLASS}
                htmlFor="automation-schedule"
              >
                <span>Schedule</span>
                <Input
                  id="automation-schedule"
                  required
                  value={draft.schedule}
                  onChange={(event) => onUpdate("schedule", event.target.value)}
                  placeholder="0 9 * * 1-5 or every 2h"
                />
              </label>
            ) : null}
            <p className="automation-builder__hint m-0 text-[11px] leading-[1.5] text-[var(--muted)]">
              {triggerHelp}
            </p>
          </section>

          <section
            className={`${AUTOMATION_BUILDER_SECTION_CLASS} automation-builder__section--condition`}
          >
            <div className={AUTOMATION_SECTION_HEADING_CLASS}>
              <strong>Condition</strong>
              <small>Guards the action</small>
            </div>
            <div className="automation-builder__inline-grid grid gap-3">
              <label className={AUTOMATION_FIELD_LABEL_CLASS}>
                <span>Continue when</span>
                <select
                  className={AUTOMATION_FIELD_CONTROL_CLASS}
                  value={draft.conditionType}
                  onChange={(event) =>
                    onUpdate(
                      "conditionType",
                      event.target.value as AutomationConditionChoice,
                    )
                  }
                >
                  <option value="always">Always</option>
                  <option value="exists">Payload field exists</option>
                  <option value="equals">Payload field equals</option>
                  <option value="contains">Payload field contains</option>
                </select>
              </label>
              {draft.conditionType !== "always" ? (
                <label
                  className={AUTOMATION_FIELD_LABEL_CLASS}
                  htmlFor="automation-condition-path"
                >
                  <span>Payload field</span>
                  <Input
                    id="automation-condition-path"
                    value={draft.conditionPath}
                    onChange={(event) =>
                      onUpdate("conditionPath", event.target.value)
                    }
                    placeholder="event.status"
                  />
                </label>
              ) : null}
              {draft.conditionType !== "always" &&
              draft.conditionType !== "exists" ? (
                <label
                  className={AUTOMATION_FIELD_LABEL_CLASS}
                  htmlFor="automation-condition-value"
                >
                  <span>Value</span>
                  <Input
                    id="automation-condition-value"
                    value={draft.conditionValue}
                    onChange={(event) =>
                      onUpdate("conditionValue", event.target.value)
                    }
                    placeholder="ready"
                  />
                </label>
              ) : null}
            </div>
            <p className="automation-builder__hint m-0 text-[11px] leading-[1.5] text-[var(--muted)]">
              {conditionHelp}
            </p>
          </section>

          <section
            className={`${AUTOMATION_BUILDER_SECTION_CLASS} automation-builder__section--action`}
          >
            <div className={AUTOMATION_SECTION_HEADING_CLASS}>
              <strong>Action</strong>
              <small>Performs the work</small>
            </div>
            <div className="automation-builder__field grid gap-1.5">
              <span className="text-[11px] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
                Then do
              </span>
              <ChoiceButtons
                choices={[
                  ["run-agent", "Run agent"],
                  ["prompt", "Prompt"],
                  ["webhook", "Webhook"],
                ]}
                label="Choose an action"
                selected={draft.actionType}
                onSelect={(value) =>
                  onUpdate("actionType", value as AutomationActionChoice)
                }
              />
            </div>
            {draft.actionType === "webhook" ? (
              <label
                className={AUTOMATION_FIELD_LABEL_CLASS}
                htmlFor="automation-webhook-url"
              >
                <span>Destination URL</span>
                <Input
                  id="automation-webhook-url"
                  type="url"
                  value={draft.webhookUrl}
                  onChange={(event) =>
                    onUpdate("webhookUrl", event.target.value)
                  }
                  placeholder="https://example.com/hooks/doolittle"
                />
              </label>
            ) : (
              <label
                className={AUTOMATION_FIELD_LABEL_CLASS}
                htmlFor="automation-prompt"
              >
                <span>Prompt</span>
                <Textarea
                  id="automation-prompt"
                  rows={4}
                  value={draft.prompt}
                  onChange={(event) => onUpdate("prompt", event.target.value)}
                  placeholder="Review the latest work and produce an operator-ready receipt."
                />
              </label>
            )}
            <p className="automation-builder__hint m-0 text-[11px] leading-[1.5] text-[var(--muted)]">
              {actionHelp}
            </p>
          </section>
        </div>
      </fieldset>

      <div className={AUTOMATION_BUILDER_FOOTER_CLASS}>
        <span>
          Output and each phase result stay in the local trace archive.
        </span>
        <Button disabled={busy} type="submit">
          {busy ? "Creating…" : "Create automation"}
        </Button>
      </div>
    </form>
  );
}
