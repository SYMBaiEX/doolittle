use super::*;

const MAX_RENDERED_PATCH_LINES: usize = 1500;

pub(super) fn render_patch(
    this: &Workbench,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let route = this.workspace_tools.patch.as_deref().unwrap_or_default();
    let data = this
        .control_value(route)
        .and_then(|response| response.get("patch"));
    let patch = data
        .and_then(|data| data["patch"].as_str())
        .unwrap_or_default();
    let path = data
        .and_then(|data| data["path"].as_str())
        .unwrap_or_default();
    let staged = data.is_some_and(|data| data["staged"].as_bool() == Some(true));
    let incomplete = data.is_some_and(|data| data["truncated"].as_bool() == Some(true))
        || patch.lines().take(MAX_RENDERED_PATCH_LINES + 1).count() > MAX_RENDERED_PATCH_LINES;
    let summary = if staged { "Index diff" } else { "Working diff" };
    let enabled = repository_scope(this).is_some()
        && !this.workspace_tools.git.confirming
        && !this.control_action_pending(MUTATE)
        && !this.control_pending(route)
        && this.control_error(route).is_none();
    let hunks = (!incomplete).then(|| split_hunks(path, patch)).flatten();
    let mut output = div()
        .id("repo-patch-output")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .font_family("Menlo")
        .px(px(8.))
        .child(super::super::request_status(this, route, "", colors, None));
    if let Some((header, hunks)) = hunks {
        output = output
            .children(header.lines().map(|line| patch_line(line, colors)))
            .children(hunks.into_iter().enumerate().map(|(index, hunk)| {
                let location = hunk.lines().next().unwrap_or_default();
                let detail = format!("{path}\n{location}");
                let patch = [header, hunk].concat();
                let index_action = if staged {
                    Action::immediate("Unstage hunk", json!({"type":"unstage-hunk","patch":patch}))
                } else {
                    Action::immediate("Stage hunk", json!({"type":"stage-hunk","patch":patch}))
                };
                div()
                    .child(
                        row(colors)
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .truncate()
                                    .text_xs()
                                    .child(location.to_owned()),
                            )
                            .child(mutation_button(
                                format!("git-index-hunk-{index}"),
                                index_action,
                                enabled,
                                cx,
                            ))
                            .when(!staged, |row| {
                                row.child(mutation_button(
                                    format!("git-discard-hunk-{index}"),
                                    Action::confirm(
                                        "Discard hunk",
                                        "Discard this unstaged hunk?",
                                        detail,
                                        json!({"type":"discard-hunk","patch":patch}),
                                        true,
                                    ),
                                    enabled,
                                    cx,
                                ))
                            }),
                    )
                    .children(hunk.lines().skip(1).map(|line| patch_line(line, colors)))
            }));
    } else {
        output = output
            .when(incomplete, |output| {
                output.child(notice(
                    colors,
                    "This diff was truncated. Hunk actions are unavailable.",
                ))
            })
            .when(
                data.is_some() && patch.is_empty() && !this.control_pending(route),
                |output| output.child(notice(colors, "No textual changes.")),
            )
            .children(
                patch
                    .lines()
                    .take(MAX_RENDERED_PATCH_LINES)
                    .map(|line| patch_line(line, colors)),
            );
    }
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            bar()
                .child(
                    button("repo-changes-back", "Back to changes")
                        .ghost()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.workspace_tools.patch = None;
                            cx.notify();
                        })),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .text_xs()
                        .child(format!("{summary} · {path}")),
                ),
        )
        .children(
            this.control_action_error(MUTATE)
                .map(|error| failure(colors, error)),
        )
        .when(this.control_action_pending(MUTATE), |pane| {
            pane.child(notice(colors, "Git operation in progress…"))
        })
        .when_some(
            this.control_action_value(MUTATE)
                .and_then(|value| value.get("result")),
            |pane, result| {
                if result["ok"].as_bool() == Some(true) {
                    pane.child(notice(colors, text(result, "summary")))
                } else {
                    pane.child(failure(colors, text(result, "error")))
                }
            },
        )
        .child(output)
        .into_any_element()
}

fn patch_line(line: &str, colors: Palette) -> Div {
    div()
        .text_xs()
        .text_color(if line.starts_with('+') {
            colors.positive
        } else if line.starts_with('-') {
            colors.danger
        } else {
            colors.text
        })
        .child(line.to_owned())
}

fn split_hunks<'a>(path: &str, patch: &'a str) -> Option<(&'a str, Vec<&'a str>)> {
    if path.is_empty() || patch.contains('\0') {
        return None;
    }
    let expected_diff = format!("diff --git a/{path} b/{path}");
    let expected_old = format!("--- a/{path}");
    let expected_new = format!("+++ b/{path}");
    let mut lines = patch.split_inclusive('\n');
    if lines.next()?.trim_end_matches('\n') != expected_diff {
        return None;
    }
    let mut offset = expected_diff.len() + 1;
    let mut starts = Vec::new();
    let (mut old, mut new) = (false, false);
    for line in lines {
        if line.starts_with("@@ ") {
            starts.push(offset);
        } else if starts.is_empty() {
            match line.trim_end_matches('\n') {
                header if header.starts_with("index ") => {}
                header if header == expected_old => old = true,
                header if header == expected_new => new = true,
                _ => return None,
            }
        } else if line.starts_with("diff --git ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
        {
            return None;
        }
        offset += line.len();
    }
    let first = *starts.first()?;
    if !old || !new {
        return None;
    }
    starts.push(patch.len());
    Some((
        &patch[..first],
        starts
            .windows(2)
            .map(|range| &patch[range[0]..range[1]])
            .collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_single_file_patch_without_coalescing_hunks() {
        let header = "diff --git a/src/file.rs b/src/file.rs\nindex 1234..5678 100644\n--- a/src/file.rs\n+++ b/src/file.rs\n";
        let first = "@@ -1 +1 @@\n-old\n+new\n";
        let second = "@@ -11 +11 @@\n-before\n+after";
        let patch = [header, first, second].concat();
        assert_eq!(
            split_hunks("src/file.rs", &patch),
            Some((header, vec![first, second]))
        );
        assert!(split_hunks("different", &patch).is_none());
        assert!(split_hunks("src/file.rs", &format!("{patch}\n{header}{first}")).is_none());
    }
}
