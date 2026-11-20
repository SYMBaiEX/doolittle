use super::*;

pub(super) const FEED: &str = "/activity?limit=200";
const FILTERS: &[(&str, &str)] = &[
    ("", "All sources"),
    ("chat-run", "Chat runs"),
    ("automation", "Automations"),
    ("delegation", "Agent tasks"),
    ("approval", "Approvals"),
    ("delivery", "Deliveries"),
    ("terminal", "Terminal"),
    ("repository-change", "Workspace changes"),
    ("codegen", "Generation"),
    ("log", "Runtime logs"),
];

#[derive(Default)]
pub(super) struct ActivityState {
    kind: &'static str,
    query: String,
    shown: usize,
    export_result: Option<Result<String, String>>,
}

impl ActivityState {
    fn path(&self, export: bool) -> String {
        let mut path = if export {
            "/activity/export?limit=200"
        } else {
            FEED
        }
        .to_owned();
        if !self.kind.is_empty() {
            path.push_str("&kind=");
            path.push_str(self.kind);
        }
        if !self.query.is_empty() {
            path.push_str("&query=");
            path.push_str(&encode_query(&self.query));
        }
        path
    }
}

pub(super) fn refresh(this: &mut Workbench, cx: &mut Context<Workbench>) {
    this.control_get(&this.operations.activity.path(false), cx);
}

pub(super) fn render(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let search = this
        .operations
        .input("activity-search", "Search events", false, window, cx);
    let activity = &this.operations.activity;
    let path = activity.path(false);
    let export_path = activity.path(true);
    let events = records(this, &path, "events");
    let displayed = activity.shown.max(35);
    let can_save = this.control_value(&export_path).is_some();
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            row(colors)
                .child(
                    group()
                        .child(div().flex_1().min_w(px(170.)).child(Input::new(&search)))
                        .child(
                            button("activity-search-apply")
                                .small()
                                .outline()
                                .label("Search")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    let query = this.operations.value("activity-search", cx);
                                    let state = &mut this.operations.activity;
                                    state.query = query
                                        .chars()
                                        .take(128)
                                        .filter(|ch| !ch.is_control())
                                        .collect();
                                    state.shown = 35;
                                    state.export_result = None;
                                    refresh(this, cx);
                                })),
                        )
                        .child(
                            button("activity-export")
                                .small()
                                .outline()
                                .label(if can_save {
                                    "Save JSON"
                                } else {
                                    "Prepare export"
                                })
                                .disabled(events.is_empty() || this.control_pending(&export_path))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    let path = this.operations.activity.path(true);
                                    if !can_save {
                                        this.control_get(&path, cx);
                                    } else if let Some(data) = this.control_value(&path) {
                                        save_json(data.clone(), cx);
                                    }
                                })),
                        ),
                )
                .child(group().children(FILTERS.iter().map(|&(kind, label)| {
                    tab(("activity-kind", label), label, activity.kind == kind).on_click(
                        cx.listener(move |this, _, _, cx| {
                            this.operations.activity.kind = kind;
                            this.operations.activity.shown = 35;
                            this.operations.activity.export_result = None;
                            refresh(this, cx);
                        }),
                    )
                })))
                .children(
                    this.control_error(&export_path)
                        .map(|message| error(colors, message.to_owned())),
                )
                .children(activity.export_result.as_ref().map(|result| match result {
                    Ok(message) => muted(colors, message.clone()),
                    Err(message) => error(colors, message.clone()),
                })),
        )
        .child(
            scroll("activity-events")
                .children(load_state(
                    this,
                    &path,
                    colors,
                    "No matching events.",
                    !events.is_empty(),
                ))
                .children(events.iter().take(displayed).map(|event| {
                    let name = title(event, "title", "Runtime event");
                    let details = value(event, "safeSummary");
                    row(colors)
                        .child(
                            group()
                                .justify_between()
                                .child(heading(name.to_owned()))
                                .child(status(colors, title(event, "status", "recorded"))),
                        )
                        .when(!details.is_empty() && details != name, |row| {
                            row.child(details.to_owned())
                        })
                        .child(muted(
                            colors,
                            format!(
                                "{} · {}",
                                title(event, "kind", "activity"),
                                value(event, "occurredAt")
                            ),
                        ))
                }))
                .when(events.len() > displayed, |list| {
                    list.child(
                        row(colors).child(
                            button("more-activity")
                                .small()
                                .outline()
                                .label("Show more")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.operations.activity.shown =
                                        this.operations.activity.shown.max(35) + 35;
                                    cx.notify();
                                })),
                        ),
                    )
                }),
        )
        .into_any_element()
}

fn save_json(data: Value, cx: &mut Context<Workbench>) {
    let directory = std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir());
    let path = cx.prompt_for_new_path(&directory, Some("doolittle-activity.json"));
    cx.spawn(async move |this, cx| {
        let result = match path.await {
            Ok(Ok(Some(path))) => {
                cx.background_executor()
                    .spawn(async move {
                        let mut contents =
                            serde_json::to_vec_pretty(&data).map_err(|error| error.to_string())?;
                        contents.push(b'\n');
                        std::fs::write(path, contents).map_err(|error| error.to_string())?;
                        Ok("Activity export saved.".to_owned())
                    })
                    .await
            }
            Ok(Err(error)) => Err(error.to_string()),
            _ => return,
        };
        let _ = this.update(cx, |this, cx| {
            this.operations.activity.export_result = Some(result);
            cx.notify();
        });
    })
    .detach();
}

#[cfg(test)]
mod tests {
    #[test]
    fn filter_query_cannot_add_parameters_to_an_export() {
        let filters = super::ActivityState {
            kind: "log",
            query: "R&D?猫".to_owned(),
            ..Default::default()
        };
        assert_eq!(
            filters.path(true),
            "/activity/export?limit=200&kind=log&query=R%26D%3F%E7%8C%AB"
        );
    }
}
