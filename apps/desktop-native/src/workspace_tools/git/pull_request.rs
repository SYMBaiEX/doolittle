use super::*;

pub(super) const REVIEW: &str = "/repo/review";

#[derive(Default)]
pub(super) struct State {
    pr_title: Option<Entity<InputState>>,
    pr_body: Option<Entity<InputState>>,
    pr_base: Option<Entity<InputState>>,
    pr_review: Option<Entity<InputState>>,
}

pub(super) fn open_pull_request(
    this: &mut Workbench,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let state = &mut this.workspace_tools.git.pull_request;
    state.pr_title =
        Some(cx.new(|cx| InputState::new(window, cx).placeholder("Pull request title")));
    state.pr_body = Some(cx.new(|cx| {
        InputState::new(window, cx)
            .multi_line(true)
            .rows(3)
            .placeholder("Description")
    }));
    state.pr_base =
        Some(cx.new(|cx| InputState::new(window, cx).placeholder("Base branch (optional)")));
    state.pr_review = Some(cx.new(|cx| {
        InputState::new(window, cx)
            .multi_line(true)
            .rows(2)
            .placeholder("Review note")
    }));
    this.control_get(REVIEW, cx);
}

fn github_url(raw: &str) -> Option<url::Url> {
    let url = url::Url::parse(raw).ok()?;
    (url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none())
    .then_some(url)
}

pub(super) fn pull_request(
    this: &Workbench,
    enabled: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let review = this
        .control_value(REVIEW)
        .and_then(|data| data.get("review"));
    let pull = review.and_then(|data| data.get("pullRequest"));
    let enabled = enabled && !this.control_pending(REVIEW) && this.control_error(REVIEW).is_none();
    let mut body = div()
        .children(
            this.control_error(REVIEW)
                .map(|error| failure(colors, error)),
        )
        .when(this.control_pending(REVIEW), |body| {
            body.child(notice(colors, "Loading GitHub review…"))
        })
        .when_some(
            review.and_then(|data| data.pointer("/degraded/detail")?.as_str()),
            |body, detail| body.child(notice(colors, detail)),
        );
    if let Some(pull) = pull {
        let url = github_url(text(pull, "url"));
        let is_draft = pull["isDraft"].as_bool() == Some(true);
        let label = if is_draft {
            "Draft"
        } else {
            text(pull, "state")
        };
        body = body
            .child(
                row(colors)
                    .child(div().flex_1().min_w_0().truncate().child(format!(
                        "#{} {}",
                        pull["number"],
                        text(pull, "title")
                    )))
                    .child(notice(colors, label))
                    .when_some(url.clone(), |row, url| {
                        row.child(
                            button("git-open-pr", "Open on GitHub").outline().on_click(
                                cx.listener(move |_, _, _, cx| cx.open_url(url.as_str())),
                            ),
                        )
                    }),
            )
            .when_some(url.as_ref(), |body, url| {
                body.child(pr_actions(this, pull, url, enabled, colors, cx))
            })
            .children(
                review
                    .and_then(|data| data["checks"].as_array())
                    .into_iter()
                    .flatten()
                    .map(|check| {
                        let conclusion = check["conclusion"]
                            .as_str()
                            .unwrap_or_else(|| text(check, "status"));
                        row(colors)
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .truncate()
                                    .child(text(check, "name").to_owned()),
                            )
                            .child(notice(colors, conclusion))
                    }),
            );
    } else if let Some(review) = review.filter(|review| {
        review.pointer("/degraded/reason").and_then(Value::as_str) == Some("no_pull_request")
    }) && let Some(repository) =
        review.pointer("/repository/slug").and_then(Value::as_str)
        && let Some(branch) = review["branch"].as_str()
    {
        let current = this
            .control_value(SUMMARY)
            .and_then(|value| value.get("summary"));
        let upstream = current
            .map(|summary| text(summary, "upstream"))
            .unwrap_or_default();
        let published = upstream == format!("origin/{branch}")
            && current.is_some_and(|summary| {
                summary["ahead"].as_u64() == Some(0) && summary["behind"].as_u64() == Some(0)
            });
        let state = &this.workspace_tools.git.pull_request;
        body = body
            .child(
                bar()
                    .child(input(&state.pr_title))
                    .child(input(&state.pr_base)),
            )
            .child(bar().child(input(&state.pr_body)))
            .when(!published, |body| {
                body.child(notice(
                    colors,
                    "Publish the current branch to GitHub before opening a pull request.",
                ))
            })
            .child(bar().children(
                [(false, "Create pull request"), (true, "Create draft")].map(|(draft, label)| {
                    let repository = repository.to_owned();
                    let branch = branch.to_owned();
                    button(label, label)
                        .outline()
                        .disabled(!enabled || !published)
                        .on_click(cx.listener(move |this, _, window, cx| {
                            let state = &this.workspace_tools.git.pull_request;
                            let title = input_value(&state.pr_title, cx);
                            let body = input_value(&state.pr_body, cx);
                            let base = input_value(&state.pr_base, cx);
                            if title.is_empty() {
                                set_error(this, "Enter a pull request title.", cx);
                                return;
                            }
                            let mut payload = json!({
                                "type":"pr-create", "title":title, "body":body, "draft":draft,
                                "repository": repository, "head": branch
                            });
                            if !base.is_empty() {
                                payload["base"] = json!(base);
                            }
                            request(
                                this,
                                Action::confirm(
                                    label,
                                    "Publish this pull request on GitHub?",
                                    format!("{repository} · {branch}\n{title}"),
                                    payload,
                                    false,
                                ),
                                window,
                                cx,
                            );
                        }))
                }),
            ));
    }
    body
}

fn pr_actions(
    this: &Workbench,
    pull: &Value,
    url: &url::Url,
    enabled: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let state = &this.workspace_tools.git.pull_request;
    let title = text(pull, "title");
    let detail = format!("{title}\n{url}");
    let is_draft = pull["isDraft"].as_bool() == Some(true);
    let action = |kind: &str, label, prompt, payload: Value| {
        let mut payload = payload;
        payload["type"] = json!(kind);
        payload["pullRequestUrl"] = json!(url.as_str());
        Action::confirm(label, prompt, detail.clone(), payload, false)
    };
    match text(pull, "state") {
        "open" => {
            let mut controls = bar();
            if is_draft {
                controls = controls.child(mutation_button(
                    "git-pr-ready",
                    action(
                        "pr-ready",
                        "Mark ready",
                        "Mark this draft as ready for review?",
                        json!({}),
                    ),
                    enabled,
                    cx,
                ));
            }
            controls = controls.child(mutation_button(
                "git-pr-close",
                action("pr-close", "Close", "Close this pull request?", json!({})),
                enabled,
                cx,
            ));
            if let Some(head) = pull["headRefOid"].as_str().filter(|_| !is_draft) {
                controls = controls.children(
                    [
                        ("merge", "Create merge commit"),
                        ("squash", "Squash and merge"),
                        ("rebase", "Rebase and merge"),
                    ]
                    .map(|(method, label)| {
                        mutation_button(
                            label,
                            action(
                                "pr-merge",
                                label,
                                "Merge this pull request on GitHub?",
                                json!({"method":method, "matchHead":head}),
                            ),
                            enabled,
                            cx,
                        )
                    }),
                );
            }
            div()
                .child(controls)
                .child(bar().child(input(&state.pr_title)).child(input(&state.pr_base)))
                .child(bar().child(input(&state.pr_body)).child(
                    button("git-pr-update", "Update details")
                        .outline()
                        .disabled(!enabled)
                        .on_click(cx.listener({
                            let url = url.to_string();
                            let detail = detail.clone();
                            move |this, _, window, cx| {
                                let state = &this.workspace_tools.git.pull_request;
                                let mut payload = json!({"type":"pr-update", "pullRequestUrl":url});
                                for (field, input) in [("title", &state.pr_title), ("body", &state.pr_body), ("base", &state.pr_base)] {
                                    let value = input_value(input, cx);
                                    if !value.is_empty() {
                                        payload[field] = json!(value);
                                    }
                                }
                                if payload.as_object().is_some_and(|fields| fields.len() <= 2) {
                                    set_error(this, "Enter a changed title, description, or base.", cx);
                                    return;
                                }
                                request(this, Action::confirm("Update details", "Update this pull request?", detail.clone(), payload, false), window, cx);
                            }
                        })),
                ))
                .child(bar().child(input(&state.pr_review)).children(
                    [("approve", "Approve"), ("comment", "Comment"), ("request-changes", "Request changes")]
                        .map(|(event, label)| {
                            let url = url.to_string();
                            let detail = detail.clone();
                            button(label, label).outline().disabled(!enabled).on_click(
                                cx.listener(move |this, _, window, cx| {
                                    let body = input_value(&this.workspace_tools.git.pull_request.pr_review, cx);
                                    if event != "approve" && body.is_empty() {
                                        set_error(this, "Write a review note first.", cx);
                                        return;
                                    }
                                    let mut payload = json!({"type":"pr-review", "pullRequestUrl":url, "event":event});
                                    if !body.is_empty() {
                                        payload["body"] = json!(body);
                                    }
                                    request(this, Action::confirm(label, "Publish this review on GitHub?", detail.clone(), payload, false), window, cx);
                                }),
                            )
                        }),
                ))
        }
        "closed" => bar().child(mutation_button(
            "git-pr-reopen",
            action(
                "pr-reopen",
                "Reopen",
                "Reopen this pull request?",
                json!({}),
            ),
            enabled,
            cx,
        )),
        _ => notice(colors, "The pull request is closed to further changes."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_github_review_urls_open() {
        assert!(github_url("https://github.com/owner/repo/pull/42").is_some());
        assert!(github_url("https://github.com.example/owner/repo/pull/42").is_none());
        assert!(github_url("https://token@github.com/owner/repo/pull/42").is_none());
        assert!(github_url("https://github.com:8443/owner/repo/pull/42").is_none());
    }
}
