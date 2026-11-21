import type { BotSummary } from "@doolittle/contracts/bots";
import { RunState } from "@doolittle/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@elizaos/ui/dropdown-menu";
import {
  Bot,
  Check,
  ChevronDown,
  FolderClosed,
  MessageSquare,
  Plus,
  Settings2,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
} from "react";
import { UiIcon } from "../components/UiIcon";
import type { ProjectScope } from "../project-manager/models";
import "./chat-sidebar-controls.css";

interface Choice {
  value: string;
  label: string;
  icon: ReactNode;
  detail?: ReactNode;
}

function SidebarChoiceMenu({
  label,
  value,
  groups,
  onChange,
  trigger,
  profile = false,
  triggerRef,
  children,
}: {
  label: string;
  value: string;
  groups: readonly Choice[][];
  onChange: (value: string) => void;
  trigger: Pick<Choice, "label" | "icon" | "detail">;
  profile?: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuOpen = useRef(false);
  const localTrigger = useRef<HTMLButtonElement>(null);
  const invoker = triggerRef ?? localTrigger;
  const leavingByTab = useRef(false);
  const changeOpen = (next: boolean) => {
    menuOpen.current = next;
    setOpen(next);
  };
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={changeOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={`chat-sidebar-picker${profile ? " chat-sidebar-picker--profile" : ""}`}
          aria-label={`${label}: ${trigger.label}`}
          ref={invoker}
          type="button"
        >
          {trigger.icon}
          <span className="chat-sidebar-choice-copy">
            <span>{trigger.label}</span>
            {trigger.detail}
          </span>
          <UiIcon icon={ChevronDown} size="xs" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        aria-label={label}
        aria-labelledby={undefined}
        className="dl-action-menu chat-sidebar-picker-menu"
        collisionPadding={10}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const tabbed = leavingByTab.current;
          leavingByTab.current = false;
          const trigger = invoker.current;
          const active = trigger?.ownerDocument.activeElement;
          // The popup restores focus asynchronously. A reopened menu or a
          // control focused by its action takes precedence over the old popup.
          if (
            !tabbed &&
            !menuOpen.current &&
            trigger?.isConnected &&
            (!active || active === trigger.ownerDocument.body)
          )
            trigger.focus({ preventScroll: true });
        }}
        onFocusOutside={(event) => {
          // A workbench panel can finish restoring focus as this menu opens.
          // Pointer dismissal, Tab and Escape still close it explicitly.
          const target = event.target;
          const dialog =
            target instanceof Element &&
            target.closest('[role="dialog"][aria-modal="true"]');
          if (!dialog || dialog.id === "desktop-sidebar")
            event.preventDefault();
        }}
        onKeyDownCapture={(event) => {
          if (event.key !== "Tab") return;
          event.stopPropagation();
          leavingByTab.current = true;
          changeOpen(false);
          invoker.current?.focus({ preventScroll: true });
        }}
        sideOffset={5}
      >
        <DropdownMenuRadioGroup onValueChange={onChange} value={value}>
          {groups
            .filter((choices) => choices.length)
            .map((choices, index) => (
              <Fragment key={choices[0].value}>
                {index ? (
                  <DropdownMenuSeparator className="dl-action-menu-separator" />
                ) : null}
                {choices.map((choice) => (
                  <DropdownMenuRadioItem
                    aria-label={choice.label}
                    className="chat-sidebar-choice"
                    key={choice.value}
                    textValue={choice.label}
                    value={choice.value}
                  >
                    {choice.icon}
                    <span className="chat-sidebar-choice-copy">
                      <span>{choice.label}</span>
                      {choice.detail}
                    </span>
                    {choice.value === value ? (
                      <UiIcon
                        icon={Check}
                        className="chat-sidebar-choice-check"
                      />
                    ) : null}
                  </DropdownMenuRadioItem>
                ))}
              </Fragment>
            ))}
        </DropdownMenuRadioGroup>
        {children ? (
          <>
            <DropdownMenuSeparator className="dl-action-menu-separator" />
            {children}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function botChoice(bot: BotSummary): Choice {
  const state =
    bot.state === "error"
      ? "error"
      : bot.state === "waiting"
        ? "waiting"
        : bot.activeRunCount > 0 || bot.state === "busy"
          ? "running"
          : undefined;
  return {
    value: `bot:${bot.id}`,
    label: bot.name,
    icon: (
      <span className="chat-sidebar-identity" aria-hidden="true">
        {bot.name.trim().charAt(0).toUpperCase() || <UiIcon icon={Bot} />}
      </span>
    ),
    detail: (
      <span className="chat-sidebar-choice-detail">
        {state ? <RunState compact state={state} /> : null}
        <span>
          {state === "running"
            ? "Working"
            : state === "waiting"
              ? "Waiting"
              : state === "error"
                ? "Needs attention"
                : bot.isDefault
                  ? "Lead bot"
                  : "Agent"}
        </span>
      </span>
    ),
  };
}

const GROUPS: Choice = {
  value: "groups",
  label: "Groups",
  icon: (
    <span className="chat-sidebar-identity">
      <UiIcon icon={Users} />
    </span>
  ),
  detail: <span className="chat-sidebar-choice-detail">Group chats</span>,
};

export function ChatScopePicker({
  bots,
  selectedBotId,
  showingGroups,
  canManageBots,
  onSelectBot,
  onSelectGroups,
  onAddBot,
  onManageBots,
  triggerRef,
}: {
  bots: readonly BotSummary[];
  selectedBotId: string;
  showingGroups: boolean;
  canManageBots: boolean;
  onSelectBot: (id: string) => void;
  onSelectGroups: () => void;
  onAddBot: () => void;
  onManageBots: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const botChoices = bots.map(botChoice);
  const selected = showingGroups
    ? GROUPS
    : botChoices.find((choice) => choice.value === `bot:${selectedBotId}`);
  return (
    <SidebarChoiceMenu
      groups={[botChoices, [GROUPS]]}
      label="Chat scope"
      onChange={(value) => {
        if (value === "groups") onSelectGroups();
        else onSelectBot(value.slice(4));
      }}
      profile
      trigger={
        selected ?? {
          label: "Choose a bot",
          icon: (
            <span className="chat-sidebar-identity">
              <UiIcon icon={Bot} />
            </span>
          ),
        }
      }
      triggerRef={triggerRef}
      value={selected?.value ?? ""}
    >
      {canManageBots ? (
        <>
          <DropdownMenuItem className="chat-sidebar-choice" onSelect={onAddBot}>
            <UiIcon icon={Plus} />
            Add bot
          </DropdownMenuItem>
          <DropdownMenuItem
            className="chat-sidebar-choice"
            onSelect={onManageBots}
          >
            <UiIcon icon={Settings2} />
            Manage bots
          </DropdownMenuItem>
        </>
      ) : null}
    </SidebarChoiceMenu>
  );
}

const GENERAL: Choice = {
  value: "unscoped",
  label: "General",
  icon: <UiIcon icon={MessageSquare} />,
};

export function ChatProjectFilter({
  projects,
  value,
  onChange,
}: {
  projects: readonly { id: string; name: string }[];
  value: ProjectScope;
  onChange: (value: ProjectScope) => void;
}) {
  const all: Choice = {
    value: "all",
    label: "All projects",
    icon: <UiIcon icon={SlidersHorizontal} />,
  };
  const projectChoices = projects.map(({ id, name }) => ({
    value: id,
    label: name,
    icon: <UiIcon icon={FolderClosed} />,
  }));
  const choices = [all, GENERAL, ...projectChoices];
  const selected = choices.find((choice) => choice.value === value) ?? all;
  return (
    <SidebarChoiceMenu
      groups={[[all, GENERAL], projectChoices]}
      label="Filter chats"
      onChange={onChange}
      trigger={{ ...selected, icon: all.icon }}
      value={selected.value}
    />
  );
}
