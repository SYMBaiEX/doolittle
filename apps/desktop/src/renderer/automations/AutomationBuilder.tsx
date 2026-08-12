import type { FormEvent, ReactNode } from "react";
import type {
  AutomationActionChoice,
  AutomationConditionChoice,
  AutomationDraft,
  AutomationTriggerChoice,
} from "../automation-model";

function AutomationBuilderStep({
  index,
  label,
  description,
  children,
}: {
  index: string;
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="automation-builder-step">
      <header>
        <span>{index}</span>
        <div>
          <strong>{label}</strong>
          <small>{description}</small>
        </div>
      </header>
      <div className="automation-builder-step__body">{children}</div>
    </section>
  );
}

function ChoiceButtons({
  choices,
  selected,
  onSelect,
}: {
  choices: Array<[string, string]>;
  selected: string;
  onSelect(value: string): void;
}) {
  return (
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

      <div className="automation-builder__flow">
        <AutomationBuilderStep
          index="01"
          label="Trigger"
          description="Starts the workflow"
        >
          <ChoiceButtons
            choices={[
              ["schedule", "Schedule"],
              ["manual", "Manual"],
              ["webhook", "Webhook"],
            ]}
            selected={draft.triggerType}
            onSelect={(value) =>
              onUpdate("triggerType", value as AutomationTriggerChoice)
            }
          />
          {draft.triggerType === "schedule" ? (
            <label>
              <span>Schedule</span>
              <input
                required
                value={draft.schedule}
                onChange={(event) => onUpdate("schedule", event.target.value)}
                placeholder="0 9 * * 1-5 or every 2h"
              />
              <small>5-field cron or an interval such as every 30m.</small>
            </label>
          ) : (
            <div className="automation-builder__truth">
              {draft.triggerType === "manual"
                ? "Runs only when you press Run now."
                : "A private local webhook path is generated after save."}
            </div>
          )}
        </AutomationBuilderStep>

        <span className="automation-flow-arrow" aria-hidden="true">
          →
        </span>

        <AutomationBuilderStep
          index="02"
          label="Condition"
          description="Guards the action"
        >
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
            <>
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
              {draft.conditionType !== "exists" ? (
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
            </>
          ) : (
            <div className="automation-builder__truth">
              Every accepted trigger continues to the action.
            </div>
          )}
        </AutomationBuilderStep>

        <span className="automation-flow-arrow" aria-hidden="true">
          →
        </span>

        <AutomationBuilderStep
          index="03"
          label="Action"
          description="Performs the work"
        >
          <ChoiceButtons
            choices={[
              ["run-agent", "Run agent"],
              ["prompt", "Prompt"],
              ["webhook", "Webhook"],
            ]}
            selected={draft.actionType}
            onSelect={(value) =>
              onUpdate("actionType", value as AutomationActionChoice)
            }
          />
          {draft.actionType === "webhook" ? (
            <label>
              <span>Destination URL</span>
              <input
                type="url"
                value={draft.webhookUrl}
                onChange={(event) => onUpdate("webhookUrl", event.target.value)}
                placeholder="https://example.com/hooks/doolittle"
              />
              <small>
                Sends a JSON POST without stored authorization headers.
              </small>
            </label>
          ) : (
            <label>
              <span>Prompt</span>
              <textarea
                rows={5}
                value={draft.prompt}
                onChange={(event) => onUpdate("prompt", event.target.value)}
                placeholder="Review the latest work and produce an operator-ready receipt."
              />
            </label>
          )}
        </AutomationBuilderStep>
      </div>

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
