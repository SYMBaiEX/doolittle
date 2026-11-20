use super::*;

pub(super) const CONFLICTS: &str = "/repo/conflicts";
pub(super) const LOG: &str = "/repo/log";
pub(super) const WORKTREES: &str = "/repo/worktrees";

#[derive(Default)]
pub(super) struct State {
    commit: Option<Entity<InputState>>,
}

#[derive(Clone, Copy)]
pub(super) enum Operation {
    Merge,
    Rebase,
    CherryPick,
}

impl Operation {
    pub(super) fn from_summary(summary: &Value) -> Option<Self> {
        match summary["operation"].as_str()? {
            "merge" => Some(Self::Merge),
            "rebase" => Some(Self::Rebase),
            "cherry-pick" => Some(Self::CherryPick),
            _ => None,
        }
    }

    fn parts(self) -> (&'static str, &'static str, &'static str) {
        match self {
            Self::Merge => ("merge", "merge-continue", "merge-abort"),
            Self::Rebase => ("rebase", "rebase-continue", "rebase-abort"),
            Self::CherryPick => ("cherry-pick", "cherry-pick-continue", "cherry-pick-abort"),
        }
    }
}

pub(super) fn integrate_branch(
    name: &str,
    enabled: bool,
    cx: &mut Context<Workbench>,
) -> [Button; 2] {
    [
        (
            "merge",
            "Merge",
            "Merge this branch into the current branch?",
        ),
        (
            "rebase",
            "Rebase",
            "Rebase the current branch onto this branch?",
        ),
    ]
    .map(|(kind, label, prompt)| {
        mutation_button(
            format!("git-{kind}-{name}"),
            Action::confirm(
                label,
                prompt,
                name.to_owned(),
                json!({"type":kind, "branch":name}),
                true,
            ),
            enabled,
            cx,
        )
    })
}

pub(super) fn conflicts(
    this: &Workbench,
    operation: Option<Operation>,
    enabled: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Option<Div> {
    let data = super::super::array(this, CONFLICTS, "conflicts");
    let has_conflicts = data.is_some_and(|rows| !rows.is_empty());
    let conflict_error = this.control_error(CONFLICTS);
    if operation.is_none() && !has_conflicts && conflict_error.is_none() {
        return None;
    }
    let mut section = div()
        .border_b_1()
        .border_color(colors.divider)
        .child(
            bar().child(div().font_weight(gpui::FontWeight::SEMIBOLD).child(
                operation.map_or_else(
                    || "Unresolved conflicts".to_owned(),
                    |operation| format!("{} in progress", operation.parts().0),
                ),
            )),
        )
        .children(conflict_error.map(|error| failure(colors, error)))
        .children(data.into_iter().flatten().filter_map(|record| {
            let path = record["path"].as_str()?;
            let editor_path = path.to_owned();
            Some(
                row(colors)
                    .child(
                        Button::new(SharedString::from(format!("git-conflict-file-{path}")))
                            .small()
                            .ghost()
                            .label(path.to_owned())
                            .disabled(repository_scope(this).is_none())
                            .flex_1()
                            .min_w_0()
                            .justify_start()
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_file(editor_path.clone(), false, window, cx);
                            })),
                    )
                    .child(mutation_button(
                        format!("git-conflict-resolved-{path}"),
                        Action::confirm(
                            "Mark resolved",
                            "Stage the resolved contents of this file?",
                            path.to_owned(),
                            json!({"type":"conflict-mark-resolved", "paths":[path]}),
                            true,
                        ),
                        enabled,
                        cx,
                    )),
            )
        }));
    if let Some(operation) = operation {
        let (name, continue_kind, abort_kind) = operation.parts();
        section = section.child(
            bar().children(
                [
                    (
                        continue_kind,
                        "Continue",
                        enabled
                            && data.is_some()
                            && !has_conflicts
                            && !this.control_pending(CONFLICTS)
                            && conflict_error.is_none(),
                    ),
                    (abort_kind, "Abort", enabled),
                ]
                .map(|(kind, label, available)| {
                    mutation_button(
                        kind,
                        Action::confirm(
                            label,
                            if kind == continue_kind {
                                "Continue the current Git operation?"
                            } else {
                                "Abort the current Git operation?"
                            },
                            name.to_owned(),
                            json!({"type":kind}),
                            true,
                        ),
                        available,
                        cx,
                    )
                }),
            ),
        );
    }
    Some(section)
}

pub(super) fn prepare_history(
    this: &mut Workbench,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    this.workspace_tools
        .git
        .advanced
        .commit
        .get_or_insert_with(|| {
            cx.new(|cx| InputState::new(window, cx).placeholder("Commit SHA or ref"))
        });
}

fn commit_row(line: &str) -> Option<(&str, &str)> {
    let (hash, subject) = line.split_once(' ')?;
    (hash.len() >= 4 && hash.len() <= 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then_some((hash, subject))
}

fn cherry_pick(commit: &str) -> Action {
    Action::confirm(
        "Cherry-pick",
        "Apply this commit to the current branch?",
        commit.to_owned(),
        json!({"type":"cherry-pick", "commit":commit}),
        true,
    )
}

pub(super) fn history(
    this: &Workbench,
    enabled: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let log = this
        .control_value(LOG)
        .and_then(|result| result["log"].as_str());
    let entries: Vec<_> = log
        .into_iter()
        .flat_map(str::lines)
        .filter_map(commit_row)
        .collect();
    div()
        .child(
            bar()
                .child(input(&this.workspace_tools.git.advanced.commit))
                .child(
                    button("git-cherry-pick", "Cherry-pick")
                        .outline()
                        .disabled(!enabled)
                        .on_click(cx.listener(|this, _, window, cx| {
                            let commit = input_value(&this.workspace_tools.git.advanced.commit, cx);
                            if commit.is_empty() {
                                set_error(this, "Enter a commit SHA or ref.", cx);
                                return;
                            }
                            request(this, cherry_pick(&commit), window, cx);
                        })),
                ),
        )
        .children(this.control_error(LOG).map(|error| failure(colors, error)))
        .when(this.control_pending(LOG) && entries.is_empty(), |body| {
            body.child(notice(colors, "Loading commit history…"))
        })
        .when(log.is_some() && entries.is_empty(), |body| {
            body.child(notice(colors, "No commits yet."))
        })
        .children(entries.into_iter().map(|(sha, subject)| {
            row(colors)
                .child(div().font_family("Menlo").text_xs().child(sha.to_owned()))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .child(subject.to_owned()),
                )
                .child(mutation_button(
                    format!("git-history-pick-{sha}"),
                    cherry_pick(sha),
                    enabled,
                    cx,
                ))
        }))
}

pub(super) fn worktrees(this: &Workbench, colors: Palette) -> Div {
    let entries = super::super::array(this, WORKTREES, "worktrees");
    let current = this.selected_workspace();
    div()
        .child(super::super::request_status(
            this,
            WORKTREES,
            "No Git worktrees.",
            colors,
            entries,
        ))
        .children(entries.into_iter().flatten().filter_map(|entry| {
            let path = entry["path"].as_str()?;
            let state = if current
                .as_deref()
                .is_some_and(|current| current == Path::new(path))
            {
                "Current workspace"
            } else if entry["prunable"].as_bool() == Some(true) {
                "Missing worktree"
            } else if entry["bare"].as_bool() == Some(true) {
                "Bare repository"
            } else if entry["detached"].as_bool() == Some(true) {
                "Detached HEAD"
            } else {
                text(entry, "branch").trim_start_matches("refs/heads/")
            };
            Some(
                row(colors)
                    .child(div().flex_1().min_w_0().truncate().child(path.to_owned()))
                    .child(notice(colors, state)),
            )
        }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_only_offers_hashes_as_commit_targets() {
        assert_eq!(
            commit_row("42b7a41 Fix teardown"),
            Some(("42b7a41", "Fix teardown"))
        );
        assert_eq!(commit_row("--no-commit forged"), None);
        assert_eq!(commit_row("fatal: missing HEAD"), None);
    }
}
