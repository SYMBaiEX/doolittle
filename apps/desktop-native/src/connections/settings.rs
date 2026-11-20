use doolittle_runtime::ControlMethod;
use gpui::{AnyElement, Context, Div, FontWeight, Window, div, prelude::*, px};
use gpui_component::{Disableable, Sizable, button::Button, input::Input};
use serde_json::{Value, json};

use super::{
    ConnectionsPage, LOGS, MEMORY_SHARED, MEMORY_USER, PLUGINS, RUNTIME, SETTINGS, action_status,
    column, field, flag, input_field, muted, notice, panel, read_status, request_action, row,
    text_at, value, values,
};
use crate::{
    ui::Palette,
    workbench::{View, Workbench},
};

const RELEASES: &str = "https://github.com/SYMBaiEX/doolittle/releases";
const DOCUMENTATION: &str = "https://github.com/SYMBaiEX/doolittle#readme";
const ISSUES: &str = "https://github.com/SYMBaiEX/doolittle/issues";

pub(super) fn render(
    page: ConnectionsPage,
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let body = match page {
        ConnectionsPage::Interfaces => column(16.)
            .child(interfaces(colors, cx))
            .child(super::acp::render(workbench, colors, window, cx)),
        ConnectionsPage::Desktop => desktop(workbench, colors, cx),
        ConnectionsPage::Tools => tools(workbench, colors, window, cx),
        ConnectionsPage::Skills => {
            let inventory = catalog(
                workbench,
                colors,
                "/skills",
                &["skills"],
                "skill-filter",
                window,
                cx,
            );
            let workshop = super::skills::workshop(workbench, colors, window, cx);
            column(16.)
                .child(panel(colors, "Skill catalog").child(inventory))
                .child(workshop)
        }
        ConnectionsPage::Plugins => panel(colors, "Plugin catalog").child(catalog(
            workbench,
            colors,
            PLUGINS,
            &["catalog"],
            "plugin-filter",
            window,
            cx,
        )),
        ConnectionsPage::Memory => memory(workbench, colors),
        ConnectionsPage::Profiles => profiles(workbench, colors, cx),
        ConnectionsPage::Execution => execution(workbench, colors, cx),
        ConnectionsPage::Advanced => advanced(workbench, colors, window, cx),
        ConnectionsPage::Logs => logs(workbench, colors, window, cx),
        ConnectionsPage::Runtime => runtime(workbench, colors, cx),
        ConnectionsPage::Compatibility => panel(colors, "Readiness checks").child(catalog(
            workbench,
            colors,
            "/runtime/compatibility",
            &["checks"],
            "readiness-filter",
            window,
            cx,
        )),
        ConnectionsPage::Registry => super::extensions::registry(workbench, colors, window, cx),
        ConnectionsPage::Setup => setup(workbench, colors, cx),
        ConnectionsPage::About => about(colors, cx),
        ConnectionsPage::Appearance
        | ConnectionsPage::Models
        | ConnectionsPage::Accounts
        | ConnectionsPage::Credentials => unreachable!("dedicated settings surface"),
    };
    body.into_any_element()
}

fn interfaces(colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    panel(colors, "Workbench layouts")
        .child(muted(
            colors,
            "Agent and IDE share the active conversation.",
        ))
        .child(
            row()
                .child(
                    Button::new("interface-agent")
                        .small()
                        .label("Open Agent view")
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.set_view(View::Agent, window, cx)
                        })),
                )
                .child(
                    Button::new("interface-ide")
                        .small()
                        .label("Open IDE view")
                        .on_click(
                            cx.listener(|this, _, window, cx| this.set_view(View::Ide, window, cx)),
                        ),
                ),
        )
}

fn desktop(workbench: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let status = if workbench.ready() {
        "Runtime ready"
    } else if workbench.connecting {
        "Starting ElizaOS…"
    } else {
        "Runtime unavailable"
    };
    panel(colors, "Desktop application")
        .child(item_row(colors, "Runtime", status))
        .child(item_row(colors, "Workspace", workbench.workspace_path()))
        .child(
            row()
                .child(
                    Button::new("desktop-open-workspace")
                        .small()
                        .label("Open workspace…")
                        .disabled(workbench.choosing_workspace || workbench.connecting)
                        .on_click(cx.listener(|this, _, _, cx| this.choose_workspace(cx))),
                )
                .when(
                    !workbench.ready() && !workbench.needs_workspace(),
                    |actions| {
                        actions.child(
                            Button::new("desktop-connect-runtime")
                                .small()
                                .label("Start runtime")
                                .disabled(workbench.connecting)
                                .on_click(cx.listener(|this, _, _, cx| this.connect(cx))),
                        )
                    },
                )
                .child(open_url(
                    "desktop-release-notes",
                    "View releases",
                    RELEASES,
                    cx,
                )),
        )
}

fn tools(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let inventory = catalog(
        workbench,
        colors,
        "/tools",
        &["tools"],
        "tool-filter",
        window,
        cx,
    );
    column(16.)
        .child(panel(colors, "Registered tools").child(inventory))
        .child(super::extensions::mcp(workbench, colors, window, cx))
}

fn memory(workbench: &Workbench, colors: &Palette) -> Div {
    let memory_panel = |title, path| {
        let data = workbench.control_value(path);
        panel(colors, title)
            .when_some(read_status(workbench, path, colors), |section, status| {
                section.child(status)
            })
            .when_some(text_at(data, "snapshot"), |section, text| {
                section.child(
                    div()
                        .text_sm()
                        .whitespace_normal()
                        .child(truncate(text, 40_000)),
                )
            })
            .when(
                data.is_some_and(|data| {
                    data.get("snapshot")
                        .and_then(Value::as_str)
                        .is_none_or(str::is_empty)
                }),
                |section| section.child(muted(colors, "No entries yet.")),
            )
    };
    column(16.)
        .child(memory_panel("Shared memory", MEMORY_SHARED))
        .child(memory_panel("Personal memory", MEMORY_USER))
        .child(details(
            workbench,
            colors,
            "/profiles/summary",
            "Profile summary",
            &["summary", "profile"],
        ))
        .child(details(
            workbench,
            colors,
            "/profiles/agent",
            "Agent profile",
            &["profile"],
        ))
}

fn profiles(workbench: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    const PATH: &str = "/personality";
    let path = PATH;
    let data = workbench.control_value(path);
    let current = data.and_then(|data| data.get("active"));
    let active_id = text_at(current, "id");
    panel(colors, "Personality profiles")
        .when_some(text_at(current, "name"), |section, name| {
            section.child(item_row(colors, "Current profile", name.to_owned()))
        })
        .when_some(read_status(workbench, path, colors), |section, status| {
            section.child(status)
        })
        .when_some(
            action_status(workbench, path, "Personality selected.", colors),
            |section, status| section.child(status),
        )
        .children(values(data, "available").iter().filter_map(|record| {
            let id = text_at(Some(record), "id")?;
            let title = text_at(Some(record), "name").unwrap_or(id);
            let summary =
                text_at(Some(record), "description").or_else(|| text_at(Some(record), "summary"));
            Some(
                column(5.)
                    .border_t_1()
                    .border_color(colors.divider)
                    .py(px(8.))
                    .child(
                        row()
                            .justify_between()
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child(title.to_owned()),
                            )
                            .child(request_action(
                                format!("personality-{id}"),
                                if active_id == Some(id) {
                                    "Current profile"
                                } else {
                                    "Use profile"
                                },
                                workbench.ready()
                                    && active_id != Some(id)
                                    && !workbench.control_action_pending(path),
                                (ControlMethod::Post, path),
                                Some(json!({"id":id})),
                                &[PATH, RUNTIME],
                                cx,
                            )),
                    )
                    .when_some(summary, |item, summary| {
                        item.child(muted(colors, summary.to_owned()))
                    }),
            )
        }))
}

fn execution(workbench: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let path = "/execution/status";
    let data = workbench.control_value(path);
    let active = data.and_then(|data| data.get("active"));
    let native = data.and_then(|data| data.get("native"));
    let backends = values(data, "backends");
    panel(colors, "Execution")
        .child(route_button(
            "edit-execution-options",
            "Edit settings",
            ConnectionsPage::Advanced,
            cx,
        ))
        .when_some(read_status(workbench, path, colors), |section, status| {
            section.child(status)
        })
        .child(scalar_fields(
            colors,
            active,
            &[
                "backend",
                "mode",
                "provider",
                "cwd",
                "timeoutMs",
                "approvalMode",
                "toolProfile",
            ],
        ))
        .child(scalar_fields(
            colors,
            native,
            &["available", "backend", "mode", "status"],
        ))
        .children(backends.iter().map(|backend| catalog_row(colors, backend)))
}

fn advanced(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    if workbench.connections.advanced_pending && !workbench.control_action_pending(SETTINGS) {
        workbench.connections.advanced_pending = false;
        if workbench.control_action_value(SETTINGS).is_some() {
            workbench.connections.advanced_edit = None;
            workbench.connections.fields.remove("advanced-edit-value");
        }
    }
    let search = input_field(
        workbench,
        "advanced-settings-filter",
        "",
        "Filter settings",
        false,
        window,
        cx,
    );
    let query = value(workbench, "advanced-settings-filter", cx)
        .trim()
        .to_lowercase();
    let selected = workbench.connections.advanced_edit.clone();
    let mut fields = Vec::new();
    if let Some(settings) = workbench
        .control_value(SETTINGS)
        .and_then(|data| data.get("settings"))
    {
        flatten("", settings, 0, &mut fields);
    }
    let mut section = panel(colors, "Effective configuration")
        .child(Input::new(&search).w_full())
        .when_some(
            read_status(workbench, SETTINGS, colors),
            |section, status| section.child(status),
        );
    if let Some((path, original)) = selected {
        let draft = input_field(
            workbench,
            "advanced-edit-value",
            &setting_display(&original),
            "New setting value",
            false,
            window,
            cx,
        );
        let busy = workbench.control_action_pending(SETTINGS);
        section = section.child(
            column(6.)
                .p(px(8.))
                .rounded(px(5.))
                .border_1()
                .border_color(colors.divider)
                .child(div().font_weight(FontWeight::SEMIBOLD).child(path.clone()))
                .child(field("New value", &draft, colors, !busy))
                .when_some(
                    action_status(workbench, SETTINGS, "Setting saved.", colors),
                    |editor, status| editor.child(status),
                )
                .child(
                    row()
                        .child(
                            Button::new("save-advanced-setting")
                                .small()
                                .label("Save setting")
                                .disabled(busy)
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    save_advanced(this, &path, &original, cx)
                                })),
                        )
                        .child(
                            Button::new("cancel-advanced-setting")
                                .small()
                                .label("Cancel")
                                .disabled(busy)
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.connections.advanced_edit = None;
                                    this.connections.fields.remove("advanced-edit-value");
                                    this.connections.feedback.remove(&ConnectionsPage::Advanced);
                                    cx.notify();
                                })),
                        ),
                ),
        );
    }
    if workbench.connections.advanced_edit.is_none()
        && workbench.control_action_value(SETTINGS).is_some()
    {
        section = section.child(notice(colors, "Runtime settings are up to date.", false));
    }
    section.children(
        fields
            .into_iter()
            .filter(|(key, value)| {
                query.is_empty() || format!("{key} {value}").to_lowercase().contains(&query)
            })
            .take(400)
            .map(|(path, display)| {
                let edit = setting_at(workbench, &path)
                    .filter(|value| setting_can_edit(&path, value))
                    .cloned();
                let enabled = workbench.ready() && !workbench.control_action_pending(SETTINGS);
                item_row(colors, path.clone(), display).when_some(edit, |row, original| {
                    row.child(
                        Button::new(gpui::SharedString::from(format!("edit-{path}")))
                            .small()
                            .label("Edit")
                            .disabled(!enabled)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.connections.advanced_edit =
                                    Some((path.clone(), original.clone()));
                                this.connections.fields.remove("advanced-edit-value");
                                this.connections.feedback.remove(&ConnectionsPage::Advanced);
                                cx.notify();
                            })),
                    )
                })
            }),
    )
}

fn setting_at<'a>(workbench: &'a Workbench, path: &str) -> Option<&'a Value> {
    let settings = workbench.control_value(SETTINGS)?.get("settings")?;
    path.split('.')
        .try_fold(settings, |part, key| part.get(key))
}

fn setting_can_edit(path: &str, original: &Value) -> bool {
    path.split_once('.').is_some_and(|(section, key)| {
        !key.contains('.') && matches!(section, "agent" | "gateway" | "execution" | "mcp")
    }) && matches!(
        original,
        Value::String(_) | Value::Number(_) | Value::Bool(_)
    )
}

fn setting_display(original: &Value) -> String {
    original
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| original.to_string())
}

fn setting_value(original: &Value, draft: &str) -> Option<Value> {
    match original {
        Value::Bool(_) => draft.parse::<bool>().ok().map(Value::Bool),
        Value::Number(_) => draft.parse::<i64>().ok().map(|number| json!(number)),
        Value::String(_)
            if !draft.is_empty() && draft.len() <= 2048 && !draft.chars().any(char::is_control) =>
        {
            Some(Value::String(draft.to_owned()))
        }
        _ => None,
    }
}

fn save_advanced(
    workbench: &mut Workbench,
    path: &str,
    original: &Value,
    cx: &mut Context<Workbench>,
) {
    if !setting_can_edit(path, original) || setting_at(workbench, path) != Some(original) {
        workbench.connections.set_feedback(
            ConnectionsPage::Advanced,
            "The setting changed. Close the editor and reopen it before saving.",
        );
        cx.notify();
        return;
    }
    let draft = value(workbench, "advanced-edit-value", cx);
    let Some(draft) = setting_value(original, draft.trim()) else {
        workbench.connections.set_feedback(
            ConnectionsPage::Advanced,
            "Enter a valid value in the same format as the current setting.",
        );
        cx.notify();
        return;
    };
    workbench
        .connections
        .feedback
        .remove(&ConnectionsPage::Advanced);
    workbench.connections.advanced_pending = true;
    workbench.control_send(
        ControlMethod::Post,
        SETTINGS,
        Some(json!({"path":path,"value":draft})),
        &[SETTINGS, RUNTIME, "/execution/status"],
        cx,
    );
}

fn logs(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let query = input_field(
        workbench,
        "runtime-log-filter",
        "",
        "Filter runtime events",
        false,
        window,
        cx,
    );
    let filter = value(workbench, "runtime-log-filter", cx)
        .trim()
        .to_lowercase();
    let logs = values(workbench.control_value(LOGS), "logs");
    column(16.)
        .child(
            panel(colors, "Runtime events")
                .child(Input::new(&query).w_full())
                .when_some(read_status(workbench, LOGS, colors), |section, status| {
                    section.child(status)
                })
                .when(
                    logs.is_empty() && workbench.control_value(LOGS).is_some(),
                    |section| section.child(muted(colors, "No events yet.")),
                )
                .children(logs.iter().filter_map(|item| {
                    let message = first_text(Some(item), &["event", "message", "name"])?;
                    let detail = first_text(Some(item), &["detail", "timestamp", "createdAt"])
                        .unwrap_or_default();
                    let level = text_at(Some(item), "level").unwrap_or("info");
                    if !filter.is_empty()
                        && !format!("{level} {message} {detail}")
                            .to_lowercase()
                            .contains(&filter)
                    {
                        return None;
                    }
                    Some(item_row(
                        colors,
                        format!("{level} · {message}"),
                        detail.to_owned(),
                    ))
                })),
        )
        .child(history_panel(
            workbench,
            colors,
            "/deliveries",
            "Gateway deliveries",
            "deliveries",
        ))
        .child(history_panel(
            workbench,
            colors,
            "/terminal/history",
            "Terminal history",
            "commands",
        ))
}

fn history_panel(
    workbench: &Workbench,
    colors: &Palette,
    path: &str,
    title: &'static str,
    key: &str,
) -> Div {
    let items = values(workbench.control_value(path), key);
    panel(colors, title)
        .when_some(read_status(workbench, path, colors), |section, status| {
            section.child(status)
        })
        .when(
            items.is_empty() && workbench.control_value(path).is_some(),
            |section| section.child(muted(colors, "No entries yet.")),
        )
        .children(items.iter().take(50).map(|item| catalog_row(colors, item)))
}

fn runtime(workbench: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    column(16.)
        .child(details(workbench, colors, RUNTIME, "Runtime status", &[]))
        .child(details(
            workbench,
            colors,
            "/runtime/services",
            "Services",
            &["services"],
        ))
        .child(details(
            workbench,
            colors,
            "/runtime/transports",
            "Transports",
            &["transports", "inventory"],
        ))
        .child(autonomy(workbench, colors, cx))
        .child(details(
            workbench,
            colors,
            "/gateway/health",
            "Gateway health",
            &[],
        ))
        .child(details(
            workbench,
            colors,
            "/gateway/runtime",
            "Gateway runtime",
            &["runtime"],
        ))
}

fn autonomy(workbench: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    const PATH: &str = "/autonomy/status";
    const INTERVAL: &str = "/autonomy/interval";
    const ENABLE: &str = "/autonomy/enable";
    const DISABLE: &str = "/autonomy/disable";
    const CADENCE: [(u64, &str); 6] = [
        (5_000, "5s"),
        (15_000, "15s"),
        (30_000, "30s"),
        (60_000, "1m"),
        (300_000, "5m"),
        (600_000, "10m"),
    ];
    let data = workbench
        .control_value(PATH)
        .and_then(|result| result.get("data"));
    let enabled = flag(data, "enabled");
    let running = flag(data, "running");
    let interval = data
        .and_then(|data| data.get("interval"))
        .and_then(Value::as_u64)
        .unwrap_or(30_000);
    let ready = workbench.ready()
        && data.is_some()
        && ![INTERVAL, ENABLE, DISABLE]
            .into_iter()
            .any(|path| workbench.control_action_pending(path));
    let label = if running {
        "Running"
    } else if enabled {
        "Enabled"
    } else {
        "Off"
    };
    panel(colors, "Autonomy")
        .child(item_row(colors, "ElizaOS reasoning loop", label))
        .child(muted(
            colors,
            "The reasoning loop can use provider tokens in the background.",
        ))
        .child(
            row()
                .child(muted(
                    colors,
                    format!("Cadence · {} seconds", interval / 1000),
                ))
                .children(CADENCE.into_iter().map(|(millis, label)| {
                    request_action(
                        format!("autonomy-{millis}"),
                        label,
                        ready && millis != interval,
                        (ControlMethod::Post, INTERVAL),
                        Some(json!({"interval":millis})),
                        &[PATH],
                        cx,
                    )
                })),
        )
        .child(request_action(
            "toggle-autonomy",
            if enabled {
                "Disable autonomy"
            } else {
                "Enable autonomy"
            },
            ready,
            (ControlMethod::Post, if enabled { DISABLE } else { ENABLE }),
            Some(json!({})),
            &[PATH],
            cx,
        ))
        .when_some(read_status(workbench, PATH, colors), |section, status| {
            section.child(status)
        })
        .children([INTERVAL, ENABLE, DISABLE].into_iter().filter_map(|path| {
            action_status(workbench, path, "Autonomy settings updated.", colors)
        }))
}

fn setup(workbench: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let checklist = "/setup/checklist";
    let summary = "/setup/summary";
    let overview = panel(colors, "Get ready to use Doolittle")
        .child(muted(
            colors,
            "Open a workspace and choose a model or link a provider account.",
        ))
        .child(
            row()
                .child(
                    Button::new("setup-choose-workspace")
                        .small()
                        .label("Open workspace…")
                        .disabled(workbench.choosing_workspace || workbench.connecting)
                        .on_click(cx.listener(|this, _, _, cx| this.choose_workspace(cx))),
                )
                .child(route_button(
                    "setup-open-models",
                    "Choose model",
                    ConnectionsPage::Models,
                    cx,
                ))
                .child(route_button(
                    "setup-open-credentials",
                    "Add API credential",
                    ConnectionsPage::Credentials,
                    cx,
                ))
                .child(route_button(
                    "setup-open-accounts",
                    "Providers & accounts",
                    ConnectionsPage::Accounts,
                    cx,
                )),
        );
    column(16.)
        .child(overview)
        .child(details(
            workbench,
            colors,
            checklist,
            "Setup checklist",
            &["checklist"],
        ))
        .child(details(
            workbench,
            colors,
            summary,
            "Workspace readiness",
            &["summary"],
        ))
}

fn about(colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    panel(colors, "Doolittle for ElizaOS")
        .child(item_row(
            colors,
            "Native desktop version",
            env!("CARGO_PKG_VERSION"),
        ))
        .child(
            row()
                .child(open_url("about-docs", "Documentation", DOCUMENTATION, cx))
                .child(open_url("about-issues", "Report an issue", ISSUES, cx))
                .child(open_url("about-release", "Releases", RELEASES, cx)),
        )
}

fn open_url(
    id: &'static str,
    label: &'static str,
    url: &'static str,
    cx: &mut Context<Workbench>,
) -> Button {
    Button::new(id)
        .small()
        .label(label)
        .on_click(cx.listener(move |_, _, _, cx| cx.open_url(url)))
}

fn route_button(
    id: &'static str,
    label: &'static str,
    page: ConnectionsPage,
    cx: &mut Context<Workbench>,
) -> Button {
    Button::new(id).small().label(label).on_click(
        cx.listener(move |this, _, window, cx| this.set_view(View::Connections(page), window, cx)),
    )
}

fn catalog(
    workbench: &mut Workbench,
    colors: &Palette,
    path: &str,
    keys: &[&str],
    filter_id: &'static str,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let search = input_field(
        workbench,
        filter_id,
        "",
        "Search this catalog",
        false,
        window,
        cx,
    );
    let filter = value(workbench, filter_id, cx).trim().to_lowercase();
    let known = workbench.control_value(path);
    let entries = keys
        .iter()
        .find_map(|key| {
            known
                .and_then(|data| data.get(key))
                .and_then(Value::as_array)
                .map(Vec::as_slice)
        })
        .or_else(|| known.and_then(Value::as_array).map(Vec::as_slice))
        .unwrap_or_default();
    let rows = entries
        .iter()
        .filter(|entry| {
            filter.is_empty()
                || [
                    "name",
                    "label",
                    "title",
                    "description",
                    "id",
                    "category",
                    "slug",
                    "packageName",
                ]
                .iter()
                .filter_map(|key| text_at(Some(entry), key))
                .any(|value| value.to_lowercase().contains(&filter))
        })
        .take(400)
        .collect::<Vec<_>>();
    column(8.)
        .child(Input::new(&search).w_full())
        .when_some(read_status(workbench, path, colors), |section, status| {
            section.child(status)
        })
        .when(known.is_some(), |section| {
            section.child(muted(
                colors,
                if rows.is_empty() {
                    "No matching entries.".to_owned()
                } else {
                    format!("{} entries", rows.len())
                },
            ))
        })
        .children(rows.into_iter().map(|entry| catalog_row(colors, entry)))
}

pub(super) fn catalog_row(colors: &Palette, entry: &Value) -> Div {
    let title = first_text(
        Some(entry),
        &[
            "displayName",
            "title",
            "name",
            "label",
            "id",
            "slug",
            "check",
            "command",
            "packageName",
        ],
    )
    .or_else(|| entry.as_str())
    .unwrap_or("Entry");
    let detail = first_text(
        Some(entry),
        &[
            "description",
            "detail",
            "summary",
            "message",
            "provider",
            "repository",
        ],
    )
    .unwrap_or_default();
    let status = first_text(
        Some(entry),
        &["status", "health", "category", "source", "version"],
    )
    .or_else(|| {
        entry
            .get("enabled")
            .and_then(Value::as_bool)
            .map(|enabled| if enabled { "Enabled" } else { "Disabled" })
    });
    let restricted = entry
        .pointer("/policy/installable")
        .and_then(Value::as_bool)
        == Some(false);
    let installed = flag(entry.get("policy"), "installed");
    column(4.)
        .min_w_0()
        .border_t_1()
        .border_color(colors.divider)
        .py(px(7.))
        .child(
            row()
                .justify_between()
                .child(
                    div()
                        .min_w_0()
                        .font_weight(FontWeight::MEDIUM)
                        .child(truncate(title, 240)),
                )
                .when_some(status, |header, status| {
                    header.child(muted(colors, truncate(status, 140)))
                })
                .when(installed || restricted, |header| {
                    header.child(muted(
                        colors,
                        if installed { "Installed" } else { "Restricted" },
                    ))
                }),
        )
        .when(!detail.is_empty(), |item| {
            item.child(muted(colors, truncate(detail, 900)))
        })
}

fn details(
    workbench: &Workbench,
    colors: &Palette,
    path: &str,
    title: &'static str,
    roots: &[&str],
) -> Div {
    let mut section = panel(colors, title)
        .when_some(read_status(workbench, path, colors), |section, status| {
            section.child(status)
        });
    let Some(response) = workbench.control_value(path) else {
        return section;
    };
    let payload = roots
        .iter()
        .find_map(|key| response.get(key))
        .unwrap_or(response);
    if let Some(entries) = payload.as_array() {
        return section.children(
            entries
                .iter()
                .take(100)
                .map(|record| catalog_row(colors, record)),
        );
    }
    if let Some(object) = payload.as_object() {
        let mut facts = Vec::new();
        flatten("", payload, 0, &mut facts);
        section = section.children(
            facts
                .into_iter()
                .take(45)
                .map(|(key, value)| item_row(colors, key, value)),
        );
        for key in [
            "checks",
            "items",
            "providers",
            "services",
            "entries",
            "transports",
        ] {
            if let Some(items) = object.get(key).and_then(Value::as_array) {
                section = section.children(
                    items
                        .iter()
                        .take(50)
                        .map(|record| catalog_row(colors, record)),
                );
            }
        }
        return section;
    }
    if let Some(text) = payload.as_str() {
        section = section.child(muted(colors, truncate(text, 5000)));
    }
    section
}

fn flatten(prefix: &str, node: &Value, depth: usize, fields: &mut Vec<(String, String)>) {
    if depth > 5 || fields.len() >= 450 {
        return;
    }
    let Some(object) = node.as_object() else {
        return;
    };
    for (key, child) in object {
        if fields.len() >= 450 || reserved(key) {
            continue;
        }
        let path = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };
        if let Some(value) = scalar(child) {
            fields.push((path, value));
        } else if child.is_object() {
            flatten(&path, child, depth + 1, fields);
        } else if let Some(items) = child.as_array() {
            fields.push((path, format!("{} entries", items.len())));
        }
    }
}

fn reserved(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    !matches!(
        key.as_str(),
        "maxtokens" | "maxoutputtokens" | "prompttokens" | "completiontokens" | "totaltokens"
    ) && [
        "token",
        "password",
        "secret",
        "passphrase",
        "api_key",
        "apikey",
        "authorization",
        "credential",
        "headers",
        "private",
        "signer",
    ]
    .iter()
    .any(|sensitive| key.contains(sensitive))
}

fn scalar_fields(colors: &Palette, value: Option<&Value>, fields: &[&str]) -> Div {
    column(3.).children(fields.iter().filter_map(|key| {
        Some(item_row(
            colors,
            (*key).to_owned(),
            scalar(value?.get(key)?)?,
        ))
    }))
}

fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.trim().is_empty() => Some(truncate(text, 900)),
        Value::Bool(flag) => Some(if *flag { "Yes".into() } else { "No".into() }),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

pub(super) fn item_row(
    colors: &Palette,
    name: impl Into<gpui::SharedString>,
    value: impl Into<gpui::SharedString>,
) -> Div {
    row()
        .min_w_0()
        .justify_between()
        .py(px(4.))
        .border_b_1()
        .border_color(colors.divider)
        .child(div().min_w_0().text_sm().child(name.into()))
        .child(muted(colors, value))
}

fn first_text<'a>(value: Option<&'a Value>, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| text_at(value, key))
}

fn truncate(value: &str, limit: usize) -> String {
    let end = value.char_indices().nth(limit).map(|(index, _)| index);
    match end {
        Some(end) => format!("{}…", &value[..end]),
        None => value.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::{flatten, truncate};
    #[test]
    fn settings_summary_omits_sensitive_fields_and_keeps_token_limits() {
        let input = serde_json::json!({"model":{"provider":"openai","apiKey":"sensitive","maxTokens":1024,"password":"sensitive"},"credentials":{"token":"sensitive"}});
        let mut fields = Vec::new();
        flatten("", &input, 0, &mut fields);
        assert_eq!(fields.len(), 2);
        assert!(
            fields
                .iter()
                .any(|(key, value)| key == "model.maxTokens" && value == "1024")
        );
        assert!(fields.iter().all(|(_, value)| !value.contains("sensitive")));
        assert_eq!(truncate("ab🙂", 2), "ab…");
    }
}
