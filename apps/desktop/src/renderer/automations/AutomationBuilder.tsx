import type { BotSummary } from "@doolittle/contracts/bots";
import { Input, NativeSelect, Textarea } from "@doolittle/ui";
import { Bot, ListFilter, Play, Plus, Save, Zap } from "lucide-react";
import { type FormEvent, useEffect, useRef } from "react";
import type {
  AutomationActionChoice,
  AutomationConditionChoice,
  AutomationDraft,
  AutomationTriggerChoice,
} from "../automation-model";
import {
  WorkbenchAction,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  AUTOMATION_BUILDER_CLASS,
  AUTOMATION_BUILDER_FOOTER_CLASS,
  AUTOMATION_BUILDER_GRID_CLASS,
  AUTOMATION_CHOICE_BUTTON_CLASS,
  AUTOMATION_CHOICE_GRID_CLASS,
  AUTOMATION_CHOICE_SELECTED_CLASS,
  AUTOMATION_FIELD_LABEL_CLASS,
} from "./layout";
import "../orchestration/work-surfaces.css";

function ChoiceButtons({
  choices,
  selected,
  onSelect,
  label,
  disabled = [],
}: {
  choices: Array<[string, string]>;
  selected: string;
  onSelect(value: string): void;
  label: string;
  disabled?: readonly string[];
}) {
  return (
    <fieldset className="automation-choice-fieldset m-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div className={AUTOMATION_CHOICE_GRID_CLASS}>
        {choices.map(([value, label]) => (
          <button
            disabled={disabled.includes(value)}
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
  editing = false,
  onSubmit,
  onUpdate,
  bots = [],
  botsError,
  botsLoading = false,
}: {
  busy?: "saving" | "occupied";
  bots?: readonly BotSummary[];
  botsError?: string | null;
  botsLoading?: boolean;
  draft: AutomationDraft;
  editing?: boolean;
  onSubmit(event: FormEvent): void;
  onUpdate<Key extends keyof AutomationDraft>(
    key: Key,
    value: AutomationDraft[Key],
  ): void;
}) {
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => nameInput.current?.focus(), []);
  const namedTarget = Boolean(
    draft.targetBotId && draft.targetBotId !== "default",
  );
  const targetAvailable =
    !namedTarget ||
    bots.some(
      (bot) =>
        bot.id === draft.targetBotId && !bot.archivedAt && !bot.isDefault,
    );
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
    <form
      aria-busy={busy === "saving"}
      className={AUTOMATION_BUILDER_CLASS}
      id="automation-builder"
      onSubmit={onSubmit}
    >
      <WorkbenchSection
        className="work-flow-identity"
        title={editing ? "Edit automation" : "New automation"}
        headingLevel={3}
        icon={Bot}
      >
        <div className="work-flow-identity__fields">
          <label
            className={`automation-name-field ${AUTOMATION_FIELD_LABEL_CLASS}`}
            htmlFor="automation-name"
          >
            <span>Name</span>
            <Input
              disabled={busy === "saving"}
              id="automation-name"
              ref={nameInput}
              value={draft.name}
              onChange={(event) => onUpdate("name", event.target.value)}
              placeholder="Release readiness"
            />
          </label>
          <label
            className={AUTOMATION_FIELD_LABEL_CLASS}
            htmlFor="automation-target-bot"
          >
            Run as
            <NativeSelect
              id="automation-target-bot"
              value={draft.targetBotId || "default"}
              disabled={busy === "saving" || editing}
              onChange={(event) => onUpdate("targetBotId", event.target.value)}
            >
              <option value="default">
                {bots.find((bot) => bot.isDefault)?.name ?? "Doolittle"}
              </option>
              {namedTarget && !targetAvailable ? (
                <option value={draft.targetBotId}>
                  {botsLoading ? "Loading bot…" : "Unavailable bot"}
                </option>
              ) : null}
              {bots
                .filter((bot) => !bot.isDefault && !bot.archivedAt)
                .map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
            </NativeSelect>
          </label>
        </div>
        {botsError || (!botsLoading && !targetAvailable) ? (
          <p role="alert" className="m-0 text-sm text-[var(--bad)]">
            {botsError || "This automation’s bot is no longer active."}
          </p>
        ) : null}
        {namedTarget ? (
          <p className="m-0 text-sm text-[var(--muted)]">
            This bot keeps its own history and approved workspace access. Saving
            requires native confirmation. This target supports scheduled or
            manual prompt and agent runs. Target ownership is fixed after
            creation.
          </p>
        ) : null}
      </WorkbenchSection>

      <fieldset
        className="automation-builder__fieldset m-0 min-w-0 border-0 p-0"
        disabled={busy === "saving"}
      >
        <legend className="sr-only">Automation definition</legend>
        <div className={AUTOMATION_BUILDER_GRID_CLASS}>
          <WorkbenchSection
            className="work-flow-stage"
            title="Trigger"
            headingLevel={3}
            icon={Zap}
            description={triggerHelp}
          >
            <div className="work-flow-stage__fields">
              <div className="automation-builder__field grid gap-1.5">
                <span className="text-[length:var(--text-control)] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
                  Start when
                </span>
                <ChoiceButtons
                  choices={[
                    ["schedule", "Schedule"],
                    ["manual", "Manual"],
                    ["webhook", "Webhook"],
                  ]}
                  label="Choose a trigger"
                  disabled={namedTarget ? ["webhook"] : []}
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
                    onChange={(event) =>
                      onUpdate("schedule", event.target.value)
                    }
                    placeholder="0 9 * * 1-5 or every 2h"
                  />
                </label>
              ) : null}
            </div>
          </WorkbenchSection>

          <WorkbenchSection
            className="work-flow-stage"
            title="Condition"
            headingLevel={3}
            icon={ListFilter}
            description={conditionHelp}
          >
            <div className="automation-builder__inline-grid grid gap-3">
              <label
                className={AUTOMATION_FIELD_LABEL_CLASS}
                htmlFor="automation-condition-type"
              >
                <span>Continue when</span>
                <NativeSelect
                  id="automation-condition-type"
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
                </NativeSelect>
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
          </WorkbenchSection>

          <WorkbenchSection
            className="work-flow-stage"
            title="Action"
            headingLevel={3}
            icon={Play}
            description={actionHelp}
          >
            <div className="work-flow-stage__fields">
              <div className="automation-builder__field grid gap-1.5">
                <span className="text-[length:var(--text-control)] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
                  Then do
                </span>
                <ChoiceButtons
                  choices={[
                    ["run-agent", "Run agent"],
                    ["prompt", "Prompt"],
                    ["webhook", "Webhook"],
                  ]}
                  label="Choose an action"
                  disabled={namedTarget ? ["webhook"] : []}
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
            </div>
          </WorkbenchSection>
        </div>
      </fieldset>

      <div className={AUTOMATION_BUILDER_FOOTER_CLASS}>
        <span>
          Output and each phase result stay in the local trace archive.
        </span>
        <WorkbenchAction
          emphasis="primary"
          icon={editing ? Save : Plus}
          disabled={Boolean(busy) || !targetAvailable}
          type="submit"
        >
          {busy === "saving"
            ? editing
              ? "Saving…"
              : "Creating…"
            : editing
              ? "Save changes"
              : "Create automation"}
        </WorkbenchAction>
      </div>
    </form>
  );
}
