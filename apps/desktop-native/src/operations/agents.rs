use serde_json::json;

use super::*;

pub(super) const BOTS: &str = "/bots";
const NAME: &str = "named-bot-name";
const PERSONA: &str = "named-bot-persona";

#[derive(Default)]
pub(super) struct AgentsState {
    edit: Option<Edit>,
    action: Option<(String, &'static str)>,
    error: Option<&'static str>,
    submitted: Option<Value>,
}

enum Edit {
    New,
    Rename(String),
}

impl AgentsState {
    fn pending(&self, this: &Workbench) -> bool {
        self.action
            .as_ref()
            .is_some_and(|(path, _)| this.control_action_pending(path))
    }
}

pub(super) fn render(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let name = this.operations.input(NAME, "Agent name", false, window, cx);
    let persona = this
        .operations
        .input(PERSONA, "Describe this agent’s purpose", true, window, cx);
    let state = &this.operations.agents;
    let busy = state.pending(this);
    let agents: Vec<_> = records(this, BOTS, "bots")
        .iter()
        .filter(|bot| bot["isDefault"].as_bool() == Some(false))
        .collect();
    panel(colors, "Named agents")
        .child(
            row(colors)
                .child(
                    group()
                        .justify_between()
                        .child(muted(
                            colors,
                            "Named agents use private workspaces and the offline model.",
                        ))
                        .child(
                            button("new-named-agent")
                                .small()
                                .primary()
                                .label("New agent")
                                .disabled(busy)
                                .on_click(cx.listener(|this, _, window, cx| {
                                    open_edit(this, Edit::New, "", window, cx)
                                })),
                        ),
                )
                .children(state.action.as_ref().and_then(|(path, label)| {
                    action_error(this, path, colors).or_else(|| {
                        if busy {
                            Some(muted(colors, "Updating agent…").into_any_element())
                        } else {
                            this.control_action_value(path)
                                .map(|_| muted(colors, *label).into_any_element())
                        }
                    })
                })),
        )
        .when_some(state.edit.as_ref(), |panel, edit| {
            let is_new = matches!(edit, Edit::New);
            panel.child(
                row(colors)
                    .bg(colors.inset)
                    .child(field(&name, "Name", colors))
                    .when(is_new, |row| row.child(field(&persona, "Purpose", colors)))
                    .children(state.error.map(|message| error(colors, message)))
                    .child(
                        group()
                            .child(
                                button("save-named-agent")
                                    .small()
                                    .primary()
                                    .disabled(busy)
                                    .label(if is_new { "Create agent" } else { "Save name" })
                                    .on_click(cx.listener(|this, _, _, cx| save(this, cx))),
                            )
                            .child(
                                button("close-named-agent-editor")
                                    .small()
                                    .ghost()
                                    .label("Close")
                                    .disabled(busy)
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.operations.agents.edit = None;
                                        cx.notify();
                                    })),
                            ),
                    ),
            )
        })
        .children(load_state(
            this,
            BOTS,
            colors,
            "No named agents yet.",
            !agents.is_empty(),
        ))
        .children(
            agents
                .into_iter()
                .map(|agent| agent_row(agent, busy, colors, cx)),
        )
}

fn open_edit(
    this: &mut Workbench,
    edit: Edit,
    name: &str,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let state = &mut this.operations.agents;
    state.edit = Some(edit);
    state.error = None;
    state.submitted = None;
    this.operations.set_value(NAME, name.to_owned(), window, cx);
    this.operations.set_value(PERSONA, "", window, cx);
    if let Some(input) = this.operations.inputs.get(NAME) {
        input.update(cx, |state, cx| state.focus(window, cx));
    }
    cx.notify();
}

fn save(this: &mut Workbench, cx: &mut Context<Workbench>) {
    let state = &this.operations.agents;
    if state.pending(this) {
        return;
    }
    let name = this.operations.value(NAME, cx);
    let persona = this.operations.value(PERSONA, cx);
    if name.is_empty() || matches!(&state.edit, Some(Edit::New)) && persona.is_empty() {
        this.operations.agents.error = Some("Enter a name and describe the agent’s purpose.");
        cx.notify();
        return;
    }
    let (method, path, body, label) = match &state.edit {
        Some(Edit::New) => (
            ControlMethod::Post,
            BOTS.to_owned(),
            json!({"name":name, "persona":persona}),
            "Agent created.",
        ),
        Some(Edit::Rename(id)) if named_id(id) => (
            ControlMethod::Patch,
            format!("{BOTS}/{id}"),
            json!({"name":name}),
            "Agent renamed.",
        ),
        _ => return,
    };
    if state.submitted.as_ref() == Some(&body) && this.control_action_value(&path).is_some() {
        this.operations.agents.error = Some("This change has already been saved.");
        cx.notify();
        return;
    }
    this.operations.agents.error = None;
    this.operations.agents.submitted = Some(body.clone());
    submit(this, method, path, Some(body), label, cx);
}

fn agent_row(agent: &Value, busy: bool, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let name = title(agent, "name", "Named agent");
    let persona = value(agent, "persona");
    let id = value(agent, "id");
    let state = title(agent, "state", "unknown");
    let archived = !value(agent, "archivedAt").is_empty() || state == "archived";
    let mut item = row(colors)
        .child(
            group()
                .justify_between()
                .child(heading(name.to_owned()))
                .child(status(colors, if archived { "archived" } else { state })),
        )
        .when(!persona.is_empty(), |row| {
            row.child(muted(colors, persona.chars().take(300).collect::<String>()))
        })
        .when(!value(agent, "error").is_empty(), |row| {
            row.child(error(colors, value(agent, "error").to_owned()))
        });
    if archived || !named_id(id) {
        return item;
    }
    let mut actions = group();
    if state == "ready" {
        let worker_id = id.to_owned();
        let worker_name = name.to_owned();
        actions = actions.child(
            button(format!("chat-bot-{id}"))
                .small()
                .primary()
                .label("Chat")
                .disabled(busy)
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_named_agent(worker_id.clone(), worker_name.clone(), window, cx);
                })),
        );
    }
    let available = match state {
        "stopped" | "error" | "failed" => Some(("activate", "Start", "Agent started.")),
        "ready" | "starting" | "busy" | "waiting" => Some(("stop", "Stop", "Agent stopped.")),
        _ => None,
    };
    if let Some((verb, label, outcome)) = available {
        let path = format!("{BOTS}/{id}/{verb}");
        actions = actions.child(
            button(path.clone())
                .small()
                .outline()
                .label(label)
                .disabled(busy)
                .on_click(cx.listener(move |this, _, _, cx| {
                    submit(this, ControlMethod::Post, path.clone(), None, outcome, cx)
                })),
        );
    }
    if state == "stopped" {
        let rename_id = id.to_owned();
        let previous = name.to_owned();
        actions = actions.child(
            button(format!("rename-bot-{id}"))
                .small()
                .ghost()
                .label("Rename")
                .disabled(busy)
                .on_click(cx.listener(move |this, _, window, cx| {
                    open_edit(this, Edit::Rename(rename_id.clone()), &previous, window, cx)
                })),
        );
    }
    let description = name.to_owned();
    let archive = format!("{BOTS}/{id}/archive");
    actions = actions.child(
        button(archive.clone())
            .small()
            .ghost()
            .label("Archive")
            .disabled(busy)
            .on_click(cx.listener(move |_, _, window, cx| {
                let route = archive.clone();
                confirm(
                    "Archive agent",
                    "Archive this named agent?",
                    &description,
                    window,
                    cx,
                    move |this, cx| {
                        submit(
                            this,
                            ControlMethod::Post,
                            route,
                            None,
                            "Agent archived.",
                            cx,
                        )
                    },
                );
            })),
    );
    item = item.child(actions);
    item
}

fn submit(
    this: &mut Workbench,
    method: ControlMethod,
    path: String,
    body: Option<Value>,
    outcome: &'static str,
    cx: &mut Context<Workbench>,
) {
    if this.operations.agents.pending(this) {
        return;
    }
    this.operations.agents.action = Some((path.clone(), outcome));
    this.control_send(method, &path, body, &[BOTS], cx);
    cx.notify();
}

fn named_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok_and(|uuid| uuid.hyphenated().to_string() == id)
}

#[cfg(test)]
mod tests {
    #[test]
    fn named_controls_require_canonical_worker_identity() {
        assert!(super::named_id("3ae39c85-05c8-4d3e-942a-cecef73d21ea"));
        assert!(!super::named_id("default"));
        assert!(!super::named_id(
            "3ae39c85-05c8-4d3e-942a-cecef73d21ea/stop"
        ));
    }
}
