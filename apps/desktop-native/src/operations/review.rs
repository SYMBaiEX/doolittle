use serde_json::json;

use super::*;

pub(super) const RECORD: &str = "/review-record?limit=80";
pub(super) const REPOSITORY: &str = "/repo/review";
pub(super) const CHANGES: &str = "/repo/changes";
const COMMENT_CREATE: &str = "/review-record/comments";

#[derive(Clone, PartialEq, Eq)]
struct Selection {
    path: String,
    staged: bool,
}

impl Selection {
    fn route(&self) -> String {
        format!(
            "/repo/patch?path={}&staged={}",
            encode_query(&self.path),
            self.staged
        )
    }
}

#[derive(Default)]
pub(super) struct ReviewState {
    selected: Option<Selection>,
    notes: HashMap<String, NoteDraft>,
    action: Option<String>,
    validation: Option<&'static str>,
    expanded: bool,
}

struct NoteDraft {
    input: Entity<InputState>,
    editing: Option<String>,
    submitted: Option<(String, String)>,
}

impl ReviewState {
    fn note(
        &mut self,
        file: &str,
        window: &mut Window,
        cx: &mut Context<Workbench>,
    ) -> &mut NoteDraft {
        self.notes
            .entry(file.to_owned())
            .or_insert_with(|| NoteDraft {
                input: cx.new(|cx| {
                    InputState::new(window, cx)
                        .placeholder("Write a file review comment")
                        .auto_grow(2, 5)
                }),
                editing: None,
                submitted: None,
            })
    }
}

pub(super) fn refresh(this: &mut Workbench, cx: &mut Context<Workbench>) {
    if let Some(selected) = &this.operations.review.selected {
        this.control_get(&selected.route(), cx);
    }
}

pub(super) fn render(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    if let Some(file) = this
        .operations
        .review
        .selected
        .as_ref()
        .map(|selected| selected.path.clone())
    {
        this.operations.review.note(&file, window, cx);
    }
    let changes = records(this, CHANGES, "changes");
    let wide = this.content_width(window, cx) >= px(880.);
    let files = panel(colors, "Changed files")
        .children(load_state(
            this,
            CHANGES,
            colors,
            "No workspace changes.",
            !changes.is_empty(),
        ))
        .children(changes.iter().map(|record| change_row(record, colors, cx)));
    if let Some(selected) = this.operations.review.selected.as_ref() {
        let detail = div()
            .min_w_0()
            .child(patch(this, selected, colors, cx))
            .child(comments(this, colors, cx));
        if wide {
            div().child(repository(this, colors, cx)).child(
                div()
                    .flex()
                    .child(
                        files
                            .w(gpui::relative(0.34))
                            .border_r_1()
                            .border_color(colors.divider),
                    )
                    .child(detail.flex_1()),
            )
        } else {
            detail
        }
    } else {
        div()
            .child(files)
            .child(repository(this, colors, cx))
            .child(comments(this, colors, cx))
    }
}

pub(super) fn scroll_id(this: &Workbench) -> &'static str {
    if this.operations.review.selected.is_some() {
        "review-file-detail"
    } else {
        "review-change-list"
    }
}

fn repository(this: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let review = this
        .control_value(REPOSITORY)
        .and_then(|value| value.get("review"));
    panel(colors, "Repository review")
        .children(load_state(
            this,
            REPOSITORY,
            colors,
            "No repository review information.",
            review.is_some(),
        ))
        .when_some(review, |panel, review| {
            let local = &review["local"];
            let branch = title(local, "branch", "Working tree");
            let pull_request = &review["pullRequest"];
            let checks = review["checks"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default();
            let workflows = review["workflowRuns"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default();
            let url = value(pull_request, "url");
            let url = url
                .strip_prefix("https://github.com/")
                .filter(|path| !path.is_empty())
                .map(|_| url.to_owned());
            panel.child(
                row(colors)
                    .child(heading(branch.to_owned()))
                    .when(pull_request.is_object(), |row| {
                        row.child(
                            group()
                                .child(title(pull_request, "title", "Pull request").to_owned())
                                .child(status(colors, title(pull_request, "state", "recorded")))
                                .children(url.map(|url| {
                                    button("open-review-pr")
                                        .small()
                                        .outline()
                                        .label("Open pull request")
                                        .on_click(cx.listener(move |_, _, _, cx| cx.open_url(&url)))
                                })),
                        )
                    })
                    .when(!value(&review["degraded"], "detail").is_empty(), |row| {
                        row.child(muted(
                            colors,
                            value(&review["degraded"], "detail").to_owned(),
                        ))
                    })
                    .children(checks.iter().chain(workflows).take(20).map(|check| {
                        group()
                            .child(muted(colors, title(check, "name", "Check").to_owned()))
                            .child(status(
                                colors,
                                title(check, "conclusion", title(check, "status", "recorded")),
                            ))
                    })),
            )
        })
}

fn change_row(record: &Value, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let path = value(record, "path");
    let staged = record["staged"].as_bool().unwrap_or(false);
    let unstaged = record["unstaged"].as_bool().unwrap_or(false)
        || record["untracked"].as_bool().unwrap_or(false);
    row(colors).child(
        group()
            .justify_between()
            .child(heading(path.to_owned()))
            .child(
                group().children(
                    [(true, "Staged"), (false, "Unstaged")]
                        .into_iter()
                        .filter(|(index, _)| if *index { staged } else { !staged || unstaged })
                        .map(|(staged, label)| {
                            let selected = Selection {
                                path: path.to_owned(),
                                staged,
                            };
                            let route = selected.route();
                            button(format!("review-change-{path}-{staged}"))
                                .small()
                                .outline()
                                .label(label)
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    let state = &mut this.operations.review;
                                    state.selected = Some(selected.clone());
                                    state.expanded = false;
                                    this.control_get(&route, cx);
                                    cx.notify();
                                }))
                        }),
                ),
            ),
    )
}

fn patch(
    this: &Workbench,
    selected: &Selection,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let route = selected.route();
    let patch = this
        .control_value(&route)
        .and_then(|value| value.get("patch"));
    let text = patch.map(|patch| value(patch, "patch")).unwrap_or_default();
    let count = if this.operations.review.expanded {
        1_200
    } else {
        250
    };
    let path = selected.path.clone();
    let draft_empty = this.composer.read(cx).value().trim().is_empty();
    let chat_hint = format!(
        "Review the current changes in `{}` and flag any issues.",
        selected.path.replace('`', "")
    );
    panel(colors, "Selected diff")
        .child(
            row(colors).child(
                group()
                    .justify_between()
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .child(heading(path.clone()))
                            .child(muted(
                                colors,
                                if selected.staged {
                                    "Staged diff"
                                } else {
                                    "Working tree diff"
                                },
                            )),
                    )
                    .child(
                        group()
                            .child(
                                button("return-to-changed-files")
                                    .small()
                                    .ghost()
                                    .label("Back to files")
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.operations.review.selected = None;
                                        this.operations.review.validation = None;
                                        cx.notify();
                                    })),
                            )
                            .child(
                                button("review-open-file")
                                    .small()
                                    .outline()
                                    .label("Open in editor")
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.set_view(crate::workbench::View::Ide, window, cx);
                                        this.open_file(path.clone(), false, window, cx);
                                    })),
                            )
                            .child(
                                button("review-ask-agent")
                                    .small()
                                    .outline()
                                    .label(if draft_empty {
                                        "Draft review prompt"
                                    } else {
                                        "Open lead chat"
                                    })
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.select_conversation(
                                            this.selected.clone(),
                                            None,
                                            window,
                                            cx,
                                        );
                                        if this.composer.read(cx).value().trim().is_empty() {
                                            this.composer.update(cx, |composer, cx| {
                                                composer.set_value(chat_hint.clone(), window, cx)
                                            });
                                            cx.notify();
                                        }
                                    })),
                            ),
                    ),
            ),
        )
        .children(load_state(
            this,
            &route,
            colors,
            "No text diff is available for this file.",
            !text.is_empty(),
        ))
        .when(!text.is_empty(), |panel| {
            panel.child(
                div()
                    .id("selected-diff")
                    .max_h(px(440.))
                    .overflow_y_scroll()
                    .overflow_x_scroll()
                    .bg(colors.inset)
                    .children(text.lines().take(count).map(|line| {
                        let ink = if line.starts_with('+') && !line.starts_with("+++") {
                            colors.positive
                        } else if line.starts_with('-') && !line.starts_with("---") {
                            colors.danger
                        } else if line.starts_with("@@") {
                            colors.muted
                        } else {
                            colors.text
                        };
                        div()
                            .px(px(12.))
                            .py(px(1.))
                            .text_size(px(12.))
                            .font_family("Menlo")
                            .text_color(ink)
                            .whitespace_nowrap()
                            .child(line.chars().take(600).collect::<String>())
                    })),
            )
        })
        .when(
            count < 1_200 && text.lines().nth(count).is_some(),
            |panel| {
                panel.child(
                    row(colors).child(
                        button("expand-diff")
                            .small()
                            .outline()
                            .label("Show more lines")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.operations.review.expanded = true;
                                cx.notify();
                            })),
                    ),
                )
            },
        )
}

fn comments(this: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let state = &this.operations.review;
    let all = this
        .control_value(RECORD)
        .and_then(|payload| payload["record"]["comments"].as_array());
    let entries: Vec<_> = all
        .into_iter()
        .flatten()
        .filter(|comment| {
            state
                .selected
                .as_ref()
                .is_none_or(|selected| value(comment, "path") == selected.path)
        })
        .collect();
    let busy = state
        .action
        .as_deref()
        .is_some_and(|path| this.control_action_pending(path));
    panel(colors, "Review comments")
        .children(state.action.as_deref().and_then(|path| {
            action_error(this, path, colors).map(|message| row(colors).child(message))
        }))
        .children(load_state(
            this,
            RECORD,
            colors,
            if state.selected.is_none() {
                "Open a changed file to leave a review comment."
            } else {
                "No review comments on this file."
            },
            !entries.is_empty(),
        ))
        .children(
            entries
                .into_iter()
                .map(|comment| comment_row(comment, busy, colors, cx)),
        )
        .when_some(
            state.selected.as_ref().and_then(|selected| {
                state
                    .notes
                    .get(&selected.path)
                    .map(|draft| (selected.path.clone(), draft))
            }),
            |panel, (file, note)| {
                panel.child(
                    row(colors)
                        .child(field(
                            &note.input,
                            if note.editing.is_some() {
                                "Edit comment"
                            } else {
                                "New comment"
                            },
                            colors,
                        ))
                        .children(state.validation.map(|message| error(colors, message)))
                        .child(
                            group().child(
                                button("submit-review-note")
                                    .small()
                                    .primary()
                                    .disabled(busy)
                                    .label("Save comment")
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        save_comment(this, &file, window, cx)
                                    })),
                            ),
                        ),
                )
            },
        )
}

fn comment_row(comment: &Value, busy: bool, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let id = value(comment, "id");
    let state = title(comment, "status", "open");
    let path = value(comment, "path");
    let copy = comment.clone();
    let description = path.to_owned();
    let endpoint = format!("{COMMENT_CREATE}/{id}");
    let cycle = if state == "resolved" {
        "reopen"
    } else {
        "resolve"
    };
    let toggle = format!("{endpoint}/{cycle}");
    let label = if state == "resolved" {
        "Reopen"
    } else {
        "Resolve"
    };
    row(colors)
        .child(
            group()
                .justify_between()
                .child(heading(path.to_owned()))
                .child(status(colors, state)),
        )
        .child(value(comment, "body").to_owned())
        .when(segment(id), |row| {
            row.child(
                group()
                    .child(
                        button(format!("edit-{id}"))
                            .small()
                            .ghost()
                            .disabled(busy)
                            .label("Edit")
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let path = value(&copy, "path").to_owned();
                                let draft = this.operations.review.note(&path, window, cx);
                                draft.editing = Some(value(&copy, "id").to_owned());
                                draft.submitted = None;
                                draft.input.update(cx, |state, cx| {
                                    state.set_value(value(&copy, "body").to_owned(), window, cx)
                                });
                                this.operations.review.selected = Some(Selection {
                                    path,
                                    staged: false,
                                });
                                this.operations.review.validation = None;
                                refresh(this, cx);
                                cx.notify();
                            })),
                    )
                    .child(
                        button(toggle.clone())
                            .small()
                            .ghost()
                            .disabled(busy)
                            .label(label)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                comment_action(this, ControlMethod::Post, &toggle, None, cx)
                            })),
                    )
                    .child(
                        button(format!("delete-{id}"))
                            .small()
                            .ghost()
                            .disabled(busy)
                            .label("Delete")
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let route = endpoint.clone();
                                confirm(
                                    this,
                                    "Delete comment",
                                    "Delete this review comment?",
                                    &description,
                                    window,
                                    cx,
                                    move |this, cx| {
                                        comment_action(
                                            this,
                                            ControlMethod::Delete,
                                            &route,
                                            None,
                                            cx,
                                        )
                                    },
                                );
                            })),
                    ),
            )
        })
}

fn save_comment(
    this: &mut Workbench,
    path: &str,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let Some(draft) = this.operations.review.notes.get(path) else {
        return;
    };
    let body = draft.input.read(cx).value().trim().to_owned();
    if body.is_empty() || body.chars().count() > 2_000 {
        this.operations.review.validation = Some("Enter a comment of up to 2,000 characters.");
        cx.notify();
        return;
    }
    if draft.submitted.as_ref().is_some_and(|(route, previous)| {
        previous == &body && this.control_action_value(route).is_some()
    }) {
        this.operations.review.validation = Some("This comment has already been saved.");
        cx.notify();
        return;
    }
    let (method, route, payload) =
        if let Some(id) = draft.editing.as_deref().filter(|id| segment(id)) {
            (
                ControlMethod::Patch,
                format!("{COMMENT_CREATE}/{id}"),
                json!({"body": body}),
            )
        } else {
            (
                ControlMethod::Post,
                COMMENT_CREATE.to_owned(),
                json!({"comment": {"path": path, "body": body}}),
            )
        };
    let input = draft.input.clone();
    if let Some(draft) = this.operations.review.notes.get_mut(path) {
        draft.submitted = Some((route.clone(), body));
    }
    this.operations.review.validation = None;
    comment_action(this, method, &route, Some(payload), cx);
    input.update(cx, |state, cx| state.focus(window, cx));
}

fn comment_action(
    this: &mut Workbench,
    method: ControlMethod,
    path: &str,
    body: Option<Value>,
    cx: &mut Context<Workbench>,
) {
    if this
        .operations
        .review
        .action
        .as_deref()
        .is_some_and(|active| this.control_action_pending(active))
    {
        return;
    }
    this.operations.review.action = Some(path.to_owned());
    this.control_send(method, path, body, &[RECORD], cx);
    cx.notify();
}
