import type { FormEvent } from "react";
import type {
  AutomationActionChoice,
  AutomationConditionChoice,
  AutomationDraft,
  AutomationTriggerChoice,
} from "../automation-model";

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
    <fieldset className="automation-choice-fieldset">
      <legend className="sr-only">{label}</legend>
      <div className="automation-choice-grid">
        {choices.map(([value, label]) => (
          <button
            aria-pressed={selected === value}
            className={selected === value ? "selected" : ""}
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
    <form className="automation-builder" onSubmit={onSubmit}>
      <div className="automation-builder__header">
        <div>
          <span className="eyebrow">Workflow builder</span>
          <h2>When this happens, decide, then act</h2>
        </div>
        <label className="automation-name-field">
          <span>Name</span>
          <input
            value={draft.name}
            onChange={(event) => onUpdate("name", event.target.value)}
            placeholder="Release readiness"
          />
        </label>
      </div>

      <fieldset className="automation-builder__fieldset">
        <legend>Automation definition</legend>
        <div className="automation-builder__grid">
          <section className="automation-builder__section">
            <div className="automation-builder__section-heading">
              <strong>Trigger</strong>
              <small>Starts the workflow</small>
            </div>
            <div className="automation-builder__field">
              <span>Start when</span>
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
              <label>
                <span>Schedule</span>
                <input
                  required
                  value={draft.schedule}
                  onChange={(event) => onUpdate("schedule", event.target.value)}
                  placeholder="0 9 * * 1-5 or every 2h"
                />
              </label>
            ) : null}
            <p className="automation-builder__hint">{triggerHelp}</p>
          </section>

          <section className="automation-builder__section automation-builder__section--condition">
            <div className="automation-builder__section-heading">
              <strong>Condition</strong>
              <small>Guards the action</small>
            </div>
            <div className="automation-builder__inline-grid">
              <label>
                <span>Continue when</span>
                <select
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
                <label>
                  <span>Payload field</span>
                  <input
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
                <label>
                  <span>Value</span>
                  <input
                    value={draft.conditionValue}
                    onChange={(event) =>
                      onUpdate("conditionValue", event.target.value)
                    }
                    placeholder="ready"
                  />
                </label>
              ) : null}
            </div>
            <p className="automation-builder__hint">{conditionHelp}</p>
          </section>

          <section className="automation-builder__section automation-builder__section--action">
            <div className="automation-builder__section-heading">
              <strong>Action</strong>
              <small>Performs the work</small>
            </div>
            <div className="automation-builder__field">
              <span>Then do</span>
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
              <label>
                <span>Destination URL</span>
                <input
                  type="url"
                  value={draft.webhookUrl}
                  onChange={(event) =>
                    onUpdate("webhookUrl", event.target.value)
                  }
                  placeholder="https://example.com/hooks/doolittle"
                />
              </label>
            ) : (
              <label>
                <span>Prompt</span>
                <textarea
                  rows={4}
                  value={draft.prompt}
                  onChange={(event) => onUpdate("prompt", event.target.value)}
                  placeholder="Review the latest work and produce an operator-ready receipt."
                />
              </label>
            )}
            <p className="automation-builder__hint">{actionHelp}</p>
          </section>
        </div>
      </fieldset>

      <div className="automation-builder__footer">
        <span>
          Output and each phase result stay in the local trace archive.
        </span>
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? "Creating…" : "Create automation"}
        </button>
      </div>
    </form>
  );
}
