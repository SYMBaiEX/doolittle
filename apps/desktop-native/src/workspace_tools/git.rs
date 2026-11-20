mod advanced;
mod patch;
mod pull_request;

use std::path::Path;

use doolittle_runtime::ControlMethod;
use gpui::{
    AnyElement, AppContext as _, Context, Div, Entity, PromptButton, PromptLevel, SharedString,
    Window, div, prelude::*, px,
};
use gpui_component::{
    Disableable as _, Selectable as _, Sizable as _,
    button::{Button, ButtonVariants as _},
    input::{Input, InputState},
};
use serde_json::{Value, json};

use crate::{themes::Palette, workbench::Workbench};

const MUTATE: &str = "/repo/mutate";
const SUMMARY: &str = "/repo/summary";
const BRANCHES: &str = "/repo/branches";
const STASHES: &str = "/repo/stashes";
const REMOTES: &str = "/repo/remotes";
pub(super) const ROUTES: &[&str] = &[
    SUMMARY,
    super::CHANGES,
    BRANCHES,
    STASHES,
    REMOTES,
    advanced::CONFLICTS,
    advanced::LOG,
    advanced::WORKTREES,
];

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum Tab {
    #[default]
    Changes,
    Branches,
    Stashes,
    Remotes,
    History,
    Worktrees,
    PullRequest,
}

#[derive(Default)]
pub(super) struct GitState {
    tab: Tab,
    message: Option<Entity<InputState>>,
    branch: Option<Entity<InputState>>,
    stash: Option<Entity<InputState>>,
    remote: Option<Entity<InputState>>,
    url: Option<Entity<InputState>>,
    error: Option<&'static str>,
    confirming: bool,
    commit_message_sent: Option<String>,
    advanced: advanced::State,
    pull_request: pull_request::State,
}

pub(super) fn open(this: &mut Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
    let git = &mut this.workspace_tools.git;
    for (field, label) in [
        (&mut git.message, "Commit message"),
        (&mut git.branch, "New branch name"),
        (&mut git.stash, "Optional stash message"),
        (&mut git.remote, "Remote name"),
        (&mut git.url, "Git remote URL"),
    ] {
        field.get_or_insert_with(|| cx.new(|cx| InputState::new(window, cx).placeholder(label)));
    }
    refresh(this, cx);
}

fn refresh(this: &mut Workbench, cx: &mut Context<Workbench>) {
    for &route in ROUTES {
        this.control_get(route, cx);
    }
    if this.workspace_tools.git.tab == Tab::PullRequest {
        this.control_get(pull_request::REVIEW, cx);
    }
}

pub(super) fn render(
    this: &Workbench,
    colors: Palette,
    _window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    if this.workspace_tools.patch.is_some() {
        return patch::render_patch(this, colors, cx);
    }
    let git = &this.workspace_tools.git;
    let summary = this
        .control_value(SUMMARY)
        .and_then(|result| result.get("summary"));
    let repo = summary.filter(|info| info["isRepository"].as_bool() == Some(true));
    let enabled =
        repository_scope(this).is_some() && !git.confirming && !this.control_action_pending(MUTATE);
    let branch = repo.map(|repo| text(repo, "branch")).unwrap_or_default();
    let operation = repo.and_then(advanced::Operation::from_summary);
    let body = match git.tab {
        Tab::Changes => changes(this, operation, enabled, colors, cx),
        Tab::Branches => branches(this, operation.is_none(), enabled, colors, cx),
        Tab::Stashes => stashes(this, enabled, colors, cx),
        Tab::Remotes => remotes(this, branch, enabled, colors, cx),
        Tab::History => advanced::history(this, operation.is_none() && enabled, colors, cx),
        Tab::Worktrees => advanced::worktrees(this, colors),
        Tab::PullRequest => {
            pull_request::pull_request(this, enabled && !branch.is_empty(), colors, cx)
        }
    };
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            bar()
                .justify_between()
                .border_b_1()
                .border_color(colors.divider)
                .child(
                    bar().children(
                        [
                            (Tab::Changes, "Changes"),
                            (Tab::Branches, "Branches"),
                            (Tab::Stashes, "Stashes"),
                            (Tab::Remotes, "Remotes"),
                            (Tab::History, "History"),
                            (Tab::Worktrees, "Worktrees"),
                            (Tab::PullRequest, "Pull request"),
                        ]
                        .into_iter()
                        .map(|(tab, label)| {
                            button(label, label)
                                .ghost()
                                .selected(git.tab == tab)
                                .on_click(cx.listener(move |this, _, window, cx| {
                                    this.workspace_tools.git.tab = tab;
                                    match tab {
                                        Tab::PullRequest => {
                                            pull_request::open_pull_request(this, window, cx)
                                        }
                                        Tab::History => advanced::prepare_history(this, window, cx),
                                        _ => {}
                                    }
                                    cx.notify();
                                }))
                        }),
                    ),
                )
                .child(
                    bar()
                        .when(!branch.is_empty(), |bar| {
                            bar.child(
                                div()
                                    .text_xs()
                                    .text_color(colors.muted)
                                    .child(branch.to_owned()),
                            )
                        })
                        .child(
                            button("git-refresh", "Refresh")
                                .ghost()
                                .on_click(cx.listener(|this, _, _, cx| refresh(this, cx))),
                        ),
                ),
        )
        .when(summary.is_some() && repo.is_none(), |pane| {
            pane.child(notice(
                colors,
                "This workspace is outside a Git repository.",
            ))
        })
        .children(
            this.control_error(SUMMARY)
                .map(|message| failure(colors, message)),
        )
        .children(git.error.map(|message| failure(colors, message)))
        .children(
            this.control_action_error(MUTATE)
                .map(|message| failure(colors, message)),
        )
        .when(this.control_action_pending(MUTATE), |pane| {
            pane.child(notice(colors, "Git operation in progress…"))
        })
        .when_some(
            this.control_action_value(MUTATE)
                .and_then(|response| response.get("result")),
            |pane, outcome| {
                let summary = text(outcome, "summary");
                if outcome["ok"].as_bool() == Some(true) {
                    pane.child(notice(colors, summary))
                } else {
                    let detail = text(outcome, "error");
                    pane.child(failure(
                        colors,
                        if detail.is_empty() {
                            "Git did not complete the requested operation."
                        } else {
                            detail
                        },
                    ))
                }
            },
        )
        .child(
            div()
                .id("git-workbench-content")
                .flex_1()
                .min_h_0()
                .min_w_0()
                .overflow_y_scroll()
                .child(body),
        )
        .into_any_element()
}

fn changes(
    this: &Workbench,
    operation: Option<advanced::Operation>,
    enabled: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let entries = super::array(this, super::CHANGES, "changes");
    let staged = entries
        .into_iter()
        .flatten()
        .filter(|entry| entry["staged"].as_bool() == Some(true))
        .count();
    div()
        .children(advanced::conflicts(this, operation, enabled, colors, cx))
        .child(bar().child(input(&this.workspace_tools.git.message))
            .child(button("repo-commit", "Commit staged").primary().disabled(!enabled || operation.is_some() || staged == 0)
                .on_click(cx.listener(move |this, _, window, cx| {
                    let message = input_value(&this.workspace_tools.git.message, cx);
                    if message.is_empty() {
                        set_error(this, "Enter a commit message.", cx);
                        return;
                    }
                    if this.workspace_tools.git.commit_message_sent.as_ref() == Some(&message)
                        && this.control_action_value(MUTATE).is_some_and(|response| response["result"]["type"] == "commit" && response["result"]["ok"] == true)
                    {
                        set_error(this, "This commit message was already submitted. Enter a message for the next commit.", cx);
                        return;
                    }
                    request(this,
                        Action::confirm("Commit staged", "Commit the staged changes?", format!("{staged} staged file(s)\n\n{message}"), json!({"type":"commit","message":message}), false), window, cx);
                }))))
        .child(super::request_status(this, super::CHANGES, "No changed files.", colors, entries))
        .children(entries.into_iter().flatten().filter_map(|record| file_row(record, enabled, colors, cx)))
}

fn file_row(
    record: &Value,
    enabled: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Option<Div> {
    let path = record["path"].as_str()?;
    let staged = record["staged"].as_bool() == Some(true);
    let untracked = record["untracked"].as_bool() == Some(true);
    let working = untracked || record["unstaged"].as_bool() == Some(true);
    let mut row = row(colors).child(div().flex_1().min_w_0().truncate().child(path.to_owned()));
    if staged {
        row = row.child(diff(path, true, cx)).child(mutation_button(
            format!("git-unstage-{path}"),
            Action::immediate("Unstage", json!({"type":"unstage","paths":[path]})),
            enabled,
            cx,
        ));
    }
    if working {
        let discard_type = if untracked {
            "discard-untracked"
        } else {
            "discard"
        };
        row = row
            .child(diff(path, false, cx))
            .child(mutation_button(
                format!("git-stage-{path}"),
                Action::immediate("Stage", json!({"type":"stage","paths":[path]})),
                enabled,
                cx,
            ))
            .child(mutation_button(
                format!("git-discard-{path}"),
                Action::confirm(
                    "Discard",
                    if untracked {
                        "Remove this untracked file?"
                    } else {
                        "Discard unstaged changes?"
                    },
                    path.to_owned(),
                    json!({"type":discard_type,"paths":[path]}),
                    true,
                ),
                enabled,
                cx,
            ));
    }
    Some(row)
}

fn diff(path: &str, staged: bool, cx: &mut Context<Workbench>) -> Button {
    let route = format!(
        "{}&staged={staged}",
        super::query_route("/repo/patch", "path", path)
    );
    button(
        format!("git-diff-{staged}-{path}"),
        if staged { "Index diff" } else { "Working diff" },
    )
    .ghost()
    .on_click(cx.listener(move |this, _, _, cx| {
        this.control_get(&route, cx);
        this.workspace_tools.patch = Some(route.clone());
        cx.notify();
    }))
}

fn branches(
    this: &Workbench,
    can_integrate: bool,
    enabled: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let entries = super::array(this, BRANCHES, "branches");
    div()
        .child(
            bar().child(input(&this.workspace_tools.git.branch)).child(
                button("git-create-branch", "Create branch")
                    .outline()
                    .disabled(!enabled)
                    .on_click(cx.listener(|this, _, window, cx| {
                        let branch = input_value(&this.workspace_tools.git.branch, cx);
                        if branch.is_empty() {
                            set_error(this, "Enter a branch name.", cx);
                            return;
                        }
                        request(
                            this,
                            Action::confirm(
                                "Create branch",
                                "Create this branch?",
                                branch.clone(),
                                json!({"type":"branch-create","branch":branch,"checkout":false}),
                                false,
                            ),
                            window,
                            cx,
                        );
                    })),
            ),
        )
        .child(super::request_status(
            this,
            BRANCHES,
            "No local branches.",
            colors,
            entries,
        ))
        .children(entries.into_iter().flatten().filter_map(|branch| {
            let name = branch["name"].as_str()?;
            let current = branch["current"].as_bool() == Some(true);
            Some(
                row(colors)
                    .child(div().flex_1().min_w_0().truncate().child(name.to_owned()))
                    .when(current, |row| row.child(notice(colors, "Current")))
                    .when(!current, |row| {
                        row.children(advanced::integrate_branch(
                            name,
                            enabled && can_integrate,
                            cx,
                        ))
                        .child(mutation_button(
                            format!("git-switch-{name}"),
                            Action::confirm(
                                "Switch",
                                "Switch the workspace branch?",
                                name.to_owned(),
                                json!({"type":"branch-switch","branch":name}),
                                true,
                            ),
                            enabled && can_integrate,
                            cx,
                        ))
                        .child(mutation_button(
                            format!("git-delete-{name}"),
                            Action::confirm(
                                "Delete",
                                "Delete this local branch?",
                                name.to_owned(),
                                json!({"type":"branch-delete","branch":name}),
                                false,
                            ),
                            enabled,
                            cx,
                        ))
                    }),
            )
        }))
}

fn stashes(this: &Workbench, enabled: bool, colors: Palette, cx: &mut Context<Workbench>) -> Div {
    let entries = super::array(this, STASHES, "stashes");
    div()
        .child(
            bar()
                .child(input(&this.workspace_tools.git.stash))
                .children(
                    [(false, "Stash tracked"), (true, "Stash all")]
                        .into_iter()
                        .map(|(untracked, label)| {
                            button(label, label)
                                .outline()
                                .disabled(!enabled)
                                .on_click(cx.listener(move |this, _, window, cx| {
                                    let message = input_value(&this.workspace_tools.git.stash, cx);
                                    let mut payload =
                                        json!({"type":"stash-create","includeUntracked":untracked});
                                    if !message.is_empty() {
                                        payload["message"] = json!(message);
                                    }
                                    let detail = if untracked {
                                        "The stash will include untracked files."
                                    } else {
                                        "The stash will include tracked files."
                                    };
                                    request(
                                        this,
                                        Action::confirm(
                                            label,
                                            "Move changes into a stash?",
                                            detail.to_owned(),
                                            payload,
                                            true,
                                        ),
                                        window,
                                        cx,
                                    );
                                }))
                        }),
                ),
        )
        .child(super::request_status(
            this,
            STASHES,
            "No saved stashes.",
            colors,
            entries,
        ))
        .children(entries.into_iter().flatten().filter_map(|item| {
            let reference = item["reference"].as_str()?;
            let message = text(item, "message");
            Some(
                row(colors)
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .child(format!("{reference} · {message}")),
                    )
                    .children(
                        [
                            ("stash-apply", "Apply", "Apply this stash?", true),
                            ("stash-pop", "Pop", "Apply and remove this stash?", true),
                            (
                                "stash-drop",
                                "Drop",
                                "Permanently remove this stash?",
                                false,
                            ),
                        ]
                        .into_iter()
                        .map(|(kind, label, title, changes_files)| {
                            mutation_button(
                                format!("git-{kind}-{reference}"),
                                Action::confirm(
                                    label,
                                    title,
                                    reference.to_owned(),
                                    json!({"type":kind,"reference":reference}),
                                    changes_files,
                                ),
                                enabled,
                                cx,
                            )
                        }),
                    ),
            )
        }))
}

fn remotes(
    this: &Workbench,
    branch: &str,
    enabled: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let entries = super::array(this, REMOTES, "remotes");
    div()
        .child(
            bar()
                .child(input(&this.workspace_tools.git.remote))
                .child(input(&this.workspace_tools.git.url))
                .children(
                    [
                        ("remote-add", "Add remote"),
                        ("remote-set-url", "Update URL"),
                    ]
                    .into_iter()
                    .map(|(kind, label)| {
                        button(kind, label)
                            .outline()
                            .disabled(!enabled)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let name = input_value(&this.workspace_tools.git.remote, cx);
                                let url = input_value(&this.workspace_tools.git.url, cx);
                                let Some(target) = remote_identity(&url) else {
                                    set_error(
                                        this,
                                        "Enter an HTTP(S), SSH, or Git remote without embedded credentials.",
                                        cx,
                                    );
                                    return;
                                };
                                if name.is_empty() {
                                    set_error(this, "Enter the remote’s name.", cx);
                                    return;
                                }
                                request(
                                    this,
                                    Action::confirm(
                                        label,
                                        "Change repository remote configuration?",
                                        format!("{name} · {target}"),
                                        json!({"type":kind,"name":name,"url":url}),
                                        false,
                                    ),
                                    window,
                                    cx,
                                );
                            }))
                    }),
                ),
        )
        .child(super::request_status(
            this,
            REMOTES,
            "No configured Git remotes.",
            colors,
            entries,
        ))
        .children(entries.into_iter().flatten().filter_map(|item| {
            let name = item["name"].as_str()?;
            let fetch = remote_identity(text(item, "fetchUrl"));
            let push = remote_identity(text(item, "pushUrl"));
            let fetch_enabled = enabled && fetch.is_some();
            let push_enabled = enabled && push.is_some();
            let fetch = fetch.as_deref().unwrap_or("Unrecognized fetch target");
            let push = push.as_deref().unwrap_or("Unrecognized push target");
            let mut row = row(colors)
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .child(format!("{name} · {fetch}")),
                )
                .child(mutation_button(
                    format!("git-fetch-{name}"),
                    Action::confirm(
                        "Fetch",
                        "Fetch remote refs?",
                        format!("{name} · {fetch}"),
                        json!({"type":"fetch","remote":name}),
                        false,
                    ),
                    fetch_enabled,
                    cx,
                ));
            if !branch.is_empty() {
                row = row
                    .child(mutation_button(
                        format!("git-pull-{name}"),
                        Action::confirm(
                            "Pull",
                            "Pull remote changes into the current branch?",
                            format!("{name}/{branch} · {fetch}"),
                            json!({"type":"pull","remote":name,"branch":branch}),
                            true,
                        ),
                        fetch_enabled,
                        cx,
                    ))
                    .child(mutation_button(
                        format!("git-push-{name}"),
                        Action::confirm(
                            "Push",
                            "Push commits to this remote?",
                            format!("{name}/{branch} · {push}"),
                            json!({"type":"push","remote":name,"branch":branch}),
                            false,
                        ),
                        push_enabled,
                        cx,
                    ));
            }
            Some(row.child(mutation_button(
                format!("git-remove-{name}"),
                Action::confirm(
                    "Remove",
                    "Remove this remote from the local repository?",
                    name.to_owned(),
                    json!({"type":"remote-remove","name":name}),
                    false,
                ),
                enabled,
                cx,
            )))
        }))
}

#[derive(Clone)]
struct Action {
    label: &'static str,
    prompt: Option<(&'static str, String)>,
    payload: Value,
    changes_files: bool,
}

impl Action {
    fn immediate(label: &'static str, payload: Value) -> Self {
        Self {
            label,
            prompt: None,
            payload,
            changes_files: false,
        }
    }
    fn confirm(
        label: &'static str,
        title: &'static str,
        detail: String,
        payload: Value,
        changes_files: bool,
    ) -> Self {
        Self {
            label,
            prompt: Some((title, detail)),
            payload,
            changes_files,
        }
    }
}

fn mutation_button(
    id: impl Into<SharedString>,
    action: Action,
    enabled: bool,
    cx: &mut Context<Workbench>,
) -> Button {
    button(id, action.label)
        .outline()
        .disabled(!enabled)
        .on_click(cx.listener(move |this, _, window, cx| request(this, action.clone(), window, cx)))
}

fn request(this: &mut Workbench, action: Action, window: &mut Window, cx: &mut Context<Workbench>) {
    if this.workspace_tools.git.confirming || this.control_action_pending(MUTATE) {
        return;
    }
    let Some(root) = repository_scope(this) else {
        set_error(
            this,
            "Open the repository root before using Git actions.",
            cx,
        );
        return;
    };
    if action.changes_files && this.has_file_protection(cx) {
        set_error(
            this,
            "Save or close the editor before changing working files.",
            cx,
        );
        return;
    }

    if let Some((title, detail)) = &action.prompt {
        let text = format!("{root}\n\n{detail}");
        let confirmation = window.prompt(
            PromptLevel::Warning,
            title,
            Some(&text),
            &[PromptButton::ok("Cancel"), PromptButton::new(action.label)],
            cx,
        );
        this.workspace_tools.git.confirming = true;
        cx.spawn(async move |this, cx| {
            let accepted = confirmation.await == Ok(1);
            let _ = this.update(cx, move |this, cx| {
                this.workspace_tools.git.confirming = false;
                if accepted {
                    perform(this, action, &root, true, cx);
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    } else {
        perform(this, action, &root, false, cx);
    }
}

fn perform(
    this: &mut Workbench,
    action: Action,
    expected_root: &str,
    confirmed: bool,
    cx: &mut Context<Workbench>,
) {
    if this.control_action_pending(MUTATE) {
        return;
    }
    if repository_scope(this).as_deref() != Some(expected_root) {
        set_error(
            this,
            "The selected repository changed. Refresh the Git pane.",
            cx,
        );
        return;
    }
    if action.changes_files && this.has_file_protection(cx) {
        set_error(
            this,
            "Save or close the editor before changing working files.",
            cx,
        );
        return;
    }
    let mut body = action.payload;
    body["workspace"] = json!(expected_root);
    if confirmed {
        body["confirmed"] = json!(true);
    }
    if body["type"] == "commit" {
        this.workspace_tools.git.commit_message_sent = body["message"].as_str().map(str::to_owned);
    }
    this.workspace_tools.git.error = None;
    let mut refresh = ROUTES.to_vec();
    if this.workspace_tools.git.tab == Tab::PullRequest {
        refresh.push(pull_request::REVIEW);
    }
    let patch = this.workspace_tools.patch.clone();
    if let Some(patch) = patch.as_deref() {
        refresh.push(patch);
    }
    this.control_send(ControlMethod::Post, MUTATE, Some(body), &refresh, cx);
}

fn repository_scope(this: &Workbench) -> Option<String> {
    let exact = this
        .control_value(SUMMARY)?
        .pointer("/summary/root")?
        .as_str()?;
    let current = this.selected_workspace()?;
    (this.ready() && current == Path::new(exact)).then(|| exact.to_owned())
}

fn remote_identity(value: &str) -> Option<String> {
    if value.is_empty()
        || value.len() > 2048
        || value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return None;
    }
    if !value.contains("://")
        && let Some((user, ssh)) = value.split_once('@')
    {
        let (host, path) = ssh.split_once(':')?;
        return (!user.is_empty()
            && user
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
            && !host.is_empty()
            && !path.is_empty()
            && host
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
            && !path.contains(['?', '#', '@', ':']))
        .then(|| format!("{host}:{path}"));
    }
    let url = url::Url::parse(value).ok()?;
    if url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.scheme(), "http" | "https" | "ssh" | "git")
        || (url.scheme() != "ssh" && !url.username().is_empty())
    {
        return None;
    }
    let host = url.host_str()?;
    let origin = url
        .port()
        .map_or_else(|| host.to_owned(), |port| format!("{host}:{port}"));
    Some(format!("{origin}{}", url.path()))
}

fn text<'a>(record: &'a Value, key: &str) -> &'a str {
    record[key].as_str().unwrap_or_default()
}
fn input(value: &Option<Entity<InputState>>) -> Div {
    div().flex_1().min_w(px(100.)).children(
        value
            .as_ref()
            .map(|input| Input::new(input).focus_bordered(false)),
    )
}
fn input_value(input: &Option<Entity<InputState>>, cx: &gpui::App) -> String {
    input
        .as_ref()
        .map(|input| input.read(cx).value().trim().to_owned())
        .unwrap_or_default()
}
fn button(id: impl Into<SharedString>, label: &'static str) -> Button {
    Button::new(id.into()).small().label(label)
}
fn bar() -> Div {
    div()
        .flex()
        .flex_wrap()
        .items_center()
        .gap(px(5.))
        .px(px(6.))
        .py(px(4.))
}
fn row(colors: Palette) -> Div {
    bar().border_b_1().border_color(colors.divider)
}
fn notice(colors: Palette, text: &str) -> Div {
    div()
        .text_xs()
        .px(px(6.))
        .text_color(colors.muted)
        .child(text.to_owned())
}
fn failure(colors: Palette, text: &str) -> Div {
    div()
        .text_xs()
        .px(px(6.))
        .text_color(colors.danger)
        .child(text.chars().take(500).collect::<String>())
}
fn set_error(this: &mut Workbench, error: &'static str, cx: &mut Context<Workbench>) {
    this.workspace_tools.git.error = Some(error);
    cx.notify();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_labels_reject_embedded_authorization_and_custom_transports() {
        assert_eq!(
            remote_identity("https://github.com/example/repo.git").as_deref(),
            Some("github.com/example/repo.git")
        );
        assert_eq!(
            remote_identity("git@github.com:example/repo.git").as_deref(),
            Some("github.com:example/repo.git")
        );
        assert_eq!(
            remote_identity("ssh://alice@source.example:8022/example/repo.git").as_deref(),
            Some("source.example:8022/example/repo.git")
        );
        assert!(remote_identity("https://secret@github.com/example/repo.git").is_none());
        assert!(remote_identity("https://github.com/example/repo.git?token=synthetic").is_none());
        assert!(remote_identity("ext::git upload-pack /tmp").is_none());
        assert!(remote_identity("file:///tmp/example").is_none());
    }
}
