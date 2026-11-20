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
    export_pending: bool,
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
    let search =
        this.operations
            .search("activity-search", "Search events", apply_search, window, cx);
    let activity = &this.operations.activity;
    let path = activity.path(false);
    let events = records(this, &path, "events");
    let displayed = activity.shown.max(35);
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            row(colors)
                .child(
                    group()
                        .child(search_field(&search))
                        .child(
                            button("activity-search-apply")
                                .small()
                                .outline()
                                .label("Search")
                                .on_click(cx.listener(|this, _, _, cx| apply_search(this, cx))),
                        )
                        .child(
                            button("activity-export")
                                .small()
                                .outline()
                                .label(if activity.export_pending {
                                    "Preparing…"
                                } else {
                                    "Export JSON"
                                })
                                .disabled(events.is_empty() || activity.export_pending)
                                .on_click(cx.listener(|this, _, _, cx| export(this, cx))),
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
                    if activity.kind.is_empty() && activity.query.is_empty() {
                        "Run activity, workspace changes, and deliveries will appear here."
                    } else {
                        "No events match these filters."
                    },
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

fn apply_search(this: &mut Workbench, cx: &mut Context<Workbench>) {
    let query = this.operations.query("activity-search", cx);
    let state = &mut this.operations.activity;
    if state.query != query {
        state.query = query;
        state.shown = 35;
        state.export_result = None;
        refresh(this, cx);
    }
}

fn export(this: &mut Workbench, cx: &mut Context<Workbench>) {
    if this.operations.activity.export_pending {
        return;
    }
    let Some(client) = this.runtime_client() else {
        return;
    };
    let state = &mut this.operations.activity;
    let requested = state.path(true);
    state.export_pending = true;
    state.export_result = None;

    let (send, receive) = async_channel::bounded(1);
    let path = requested.clone();
    std::thread::spawn(move || {
        let _ = send.send_blocking(client.control(ControlMethod::Get, &path, None));
    });
    cx.spawn(async move |this, cx| {
        let receipt = receive.recv().await;
        let _ = this.update(cx, |this, cx| {
            let state = &mut this.operations.activity;
            state.export_pending = false;
            if this.view == crate::workbench::View::Operations(OpsPage::Activity)
                && state.path(true) == requested
            {
                match receipt {
                    Ok(Ok(data)) => {
                        state.export_pending = true;
                        save_json(data, cx);
                    }
                    Ok(Err(reason)) => state.export_result = Some(Err(reason.to_string())),
                    Err(_) => {
                        state.export_result = Some(Err("The export request ended early.".into()))
                    }
                }
            }
            cx.notify();
        });
    })
    .detach();
    cx.notify();
}

fn save_json(data: Value, cx: &mut Context<Workbench>) {
    let directory = std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir());
    let path = cx.prompt_for_new_path(&directory, Some("doolittle-activity.json"));
    cx.spawn(async move |this, cx| {
        let result = match path.await {
            Ok(Ok(Some(path))) => Some(
                cx.background_executor()
                    .spawn(async move {
                        let mut contents =
                            serde_json::to_vec_pretty(&data).map_err(|error| error.to_string())?;
                        contents.push(b'\n');
                        std::fs::write(path, contents).map_err(|error| error.to_string())?;
                        Ok("Activity export saved.".to_owned())
                    })
                    .await,
            ),
            Ok(Err(error)) => Some(Err(error.to_string())),
            _ => None,
        };
        let _ = this.update(cx, |this, cx| {
            let state = &mut this.operations.activity;
            state.export_pending = false;
            state.export_result = result;
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
