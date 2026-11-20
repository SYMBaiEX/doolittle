mod accounts;
mod acp;
mod extensions;
mod models;
mod oauth;
mod settings;
mod skills;
pub(crate) mod wallet;

use std::collections::HashMap;

use doolittle_runtime::ControlMethod;
use gpui::{
    AnyElement, Context, Div, Entity, FontWeight, SharedString, Subscription, Window, div,
    prelude::*, px,
};
use gpui_component::{
    Disableable, IconName, Selectable, Sizable,
    button::{Button, ButtonVariants},
    input::{Input, InputEvent, InputState},
    menu::{DropdownMenu, PopupMenuItem},
};
use serde_json::Value;

use crate::{
    ui::Palette,
    workbench::{View, Workbench},
};

const PROVIDER_ACCOUNTS: &str = "/runtime/accounts";
const ACCOUNT_POOLS: &str = "/runtime/account-pool";
const RUNTIME: &str = "/runtime/status";
pub(crate) const SETTINGS: &str = "/settings";
const MODELS: &str = "/runtime/models?refresh=false";
const LIVE_MODELS: &str = "/runtime/models?refresh=true";
const MEMORY_SHARED: &str = "/memory?target=memory";
const MEMORY_USER: &str = "/memory?target=user";
const PLUGINS: &str = "/runtime/plugins?view=catalog";
const LOGS: &str = "/logs?limit=150";

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum ConnectionsPage {
    Appearance,
    Interfaces,
    Desktop,
    Models,
    Accounts,
    Credentials,
    Tools,
    Skills,
    Plugins,
    Memory,
    Profiles,
    Execution,
    Advanced,
    Logs,
    Runtime,
    Compatibility,
    Registry,
    Setup,
    About,
}

const SETTINGS_NAV: &[(&str, &[ConnectionsPage])] = &[
    ("Get started", &[ConnectionsPage::Setup]),
    (
        "App",
        &[
            ConnectionsPage::Appearance,
            ConnectionsPage::Interfaces,
            ConnectionsPage::Desktop,
        ],
    ),
    (
        "Providers",
        &[
            ConnectionsPage::Models,
            ConnectionsPage::Accounts,
            ConnectionsPage::Credentials,
        ],
    ),
    (
        "Extensions",
        &[
            ConnectionsPage::Tools,
            ConnectionsPage::Skills,
            ConnectionsPage::Plugins,
            ConnectionsPage::Registry,
        ],
    ),
    (
        "Personalization",
        &[ConnectionsPage::Memory, ConnectionsPage::Profiles],
    ),
    (
        "Runtime",
        &[
            ConnectionsPage::Execution,
            ConnectionsPage::Advanced,
            ConnectionsPage::Logs,
            ConnectionsPage::Runtime,
            ConnectionsPage::Compatibility,
        ],
    ),
    ("Support", &[ConnectionsPage::About]),
];

impl ConnectionsPage {
    pub(crate) const fn label(self) -> &'static str {
        match self {
            Self::Appearance => "Appearance",
            Self::Interfaces => "Interfaces",
            Self::Desktop => "Desktop",
            Self::Models => "Models",
            Self::Accounts => "Providers & accounts",
            Self::Credentials => "Credentials",
            Self::Tools => "Tools",
            Self::Skills => "Skills",
            Self::Plugins => "Plugins",
            Self::Memory => "Memory",
            Self::Profiles => "Profiles",
            Self::Execution => "Execution",
            Self::Advanced => "Advanced",
            Self::Logs => "Logs",
            Self::Runtime => "Runtime",
            Self::Compatibility => "Compatibility",
            Self::Registry => "Registry",
            Self::Setup => "Setup",
            Self::About => "About",
        }
    }

    pub(crate) const fn routes(self) -> &'static [&'static str] {
        match self {
            Self::Appearance | Self::Desktop | Self::About => &[],
            Self::Interfaces => acp::ROUTES,
            Self::Models => &[SETTINGS, MODELS],
            Self::Accounts => &[PROVIDER_ACCOUNTS, ACCOUNT_POOLS],
            Self::Credentials => &[ACCOUNT_POOLS],
            Self::Tools => &["/tools", "/mcp/status", extensions::MCP_CACHED],
            Self::Skills => &["/skills", skills::PROPOSALS],
            Self::Plugins => &[PLUGINS],
            Self::Memory => &[
                MEMORY_SHARED,
                MEMORY_USER,
                "/profiles/summary",
                "/profiles/agent",
            ],
            Self::Profiles => &["/personality"],
            Self::Execution => &["/execution/status", SETTINGS],
            Self::Advanced => &[SETTINGS],
            Self::Logs => &[LOGS, "/deliveries", "/terminal/history"],
            Self::Runtime => &[
                RUNTIME,
                "/runtime/services",
                "/runtime/transports",
                "/autonomy/status",
                "/gateway/health",
                "/gateway/runtime",
            ],
            Self::Compatibility => &["/runtime/compatibility"],
            Self::Registry => &[extensions::REGISTRY],
            Self::Setup => &[settings::SETUP_SUMMARY, SETTINGS],
        }
    }

    const fn description(self) -> &'static str {
        match self {
            Self::Appearance => "Theme and display preferences",
            Self::Interfaces => "Choose a workbench view or connect an ACP agent",
            Self::Desktop => "Application lifecycle and releases",
            Self::Models => "Choose which model handles new messages",
            Self::Accounts => "Connect a provider account and choose a default",
            Self::Credentials => "Save an API key to the local ElizaOS vault",
            Self::Tools => "Registered actions and integrations",
            Self::Skills => "Skills available to this runtime",
            Self::Plugins => "Installed and discoverable ElizaOS packages",
            Self::Memory => "Shared and personal agent memory",
            Self::Profiles => "The personality used by the local agent",
            Self::Execution => "Execution backends and tool policy",
            Self::Advanced => "Runtime configuration",
            Self::Logs => "Runtime events, deliveries and terminal history",
            Self::Runtime => "Model, services, transports and gateway",
            Self::Compatibility => "Platform and provider readiness",
            Self::Registry => "ElizaOS registry and package sources",
            Self::Setup => "Open a workspace, connect a provider, and start a conversation",
            Self::About => "Client version, documentation and support",
        }
    }

    const fn available_without_runtime(self) -> bool {
        matches!(
            self,
            Self::Appearance | Self::Desktop | Self::About | Self::Setup | Self::Interfaces
        )
    }
}

#[derive(Default)]
pub(crate) struct ConnectionsState {
    fields: HashMap<&'static str, Field>,
    feedback: HashMap<ConnectionsPage, String>,
    credential_provider: accounts::DirectProvider,
    credential_options_open: bool,
    linked_provider: Option<accounts::LinkedProvider>,
    account_edit: Option<(String, String)>,
    oauth_provider: Option<accounts::LinkedProvider>,
    oauth_generation: u64,
    oauth_browser_requested: bool,
    show_live_models: bool,
    model_baseline: Option<[String; 6]>,
    submitted_model: Option<[String; 6]>,
    model_options_open: bool,
    settings_writer: Option<ConnectionsPage>,
    show_mcp: bool,
    show_skill_workshop: bool,
    workshop: skills::WorkshopState,
    advanced_edit: Option<(String, Value)>,
    advanced_pending: bool,
    catalog: extensions::CatalogState,
    acp: acp::PanelState,
}

struct Field {
    input: Entity<InputState>,
    _changes: Subscription,
}

impl ConnectionsState {
    pub(crate) fn clear_sensitive_drafts(&mut self) {
        self.fields.remove("provider-api-key");
        self.fields.remove("provider-oauth-code");
    }

    fn set_feedback(&mut self, page: ConnectionsPage, message: impl Into<String>) {
        self.feedback.insert(page, message.into());
    }
}

pub(crate) fn render(
    page: ConnectionsPage,
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let wide = workbench.content_width(window, cx) >= px(760.);
    let ranges = page.routes();
    let active = workbench.ready();
    let alternate = match page {
        ConnectionsPage::Tools => workbench.connections.show_mcp,
        ConnectionsPage::Skills => workbench.connections.show_skill_workshop,
        _ => false,
    };
    let loading = ranges.iter().any(|path| workbench.control_pending(path));
    let failed = ranges
        .iter()
        .any(|path| workbench.control_error(path).is_some());
    let content = if active || page.available_without_runtime() {
        match page {
            ConnectionsPage::Appearance => crate::themes::appearance_panel(cx),
            ConnectionsPage::Models => models::render(workbench, colors, window, cx),
            ConnectionsPage::Accounts => accounts::render(workbench, colors, window, cx),
            ConnectionsPage::Credentials => accounts::credentials(workbench, colors, window, cx),
            _ => settings::render(page, workbench, colors, window, cx),
        }
    } else {
        runtime_required(workbench, colors, cx).into_any_element()
    };
    let header = div()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(12.))
        .px(px(16.))
        .py(px(12.))
        .border_b_1()
        .border_color(colors.divider)
        .child(
            column(4.)
                .flex_1()
                .min_w_0()
                .child(
                    div()
                        .text_xl()
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(page.label()),
                )
                .child(muted(colors, page.description())),
        )
        .child(
            row()
                .justify_end()
                .when(!wide, |actions| actions.child(compact_navigation(page, cx)))
                .when(active && !ranges.is_empty(), |actions| {
                    actions.child(
                        Button::new("settings-reload")
                            .small()
                            .ghost()
                            .label(if loading {
                                "Refreshing…"
                            } else if failed {
                                "Retry"
                            } else {
                                "Refresh"
                            })
                            .disabled(loading)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                for path in ranges {
                                    this.control_get(path, cx);
                                }
                            })),
                    )
                }),
        );
    div()
        .flex()
        .size_full()
        .min_w_0()
        .overflow_hidden()
        .when(wide, |layout| layout.child(navigation(page, colors, cx)))
        .child(
            column(0.).flex_1().min_w_0().min_h_0().child(header).child(
                div()
                    .id(SharedString::from(format!(
                        "settings-content-{page:?}-{alternate}"
                    )))
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(
                        column(0.)
                            .min_w_0()
                            .when_some(
                                workbench.connections.feedback.get(&page),
                                |body, feedback| {
                                    body.child(div().px(px(16.)).pt(px(12.)).child(notice(
                                        colors,
                                        feedback.clone(),
                                        true,
                                    )))
                                },
                            )
                            .child(content),
                    ),
            ),
        )
        .into_any_element()
}

fn navigation(page: ConnectionsPage, colors: &Palette, cx: &mut Context<Workbench>) -> AnyElement {
    div()
        .id("settings-navigation")
        .flex_none()
        .w(px(190.))
        .h_full()
        .overflow_y_scroll()
        .bg(colors.rail)
        .border_r_1()
        .border_color(colors.divider)
        .child(
            column(12.)
                .p(px(10.))
                .children(SETTINGS_NAV.iter().map(|(group, pages)| {
                    column(2.)
                        .child(muted(colors, *group).px(px(8.)).text_xs())
                        .children(pages.iter().copied().map(|target| {
                            let item = Button::new(gpui::SharedString::from(format!(
                                "settings-section-{target:?}"
                            )))
                            .small()
                            .ghost()
                            .selected(page == target)
                            .w_full()
                            .justify_start()
                            .label(target.label());
                            item.on_click(cx.listener(move |this, _, window, cx| {
                                this.set_view(View::Connections(target), window, cx)
                            }))
                        }))
                })),
        )
        .into_any_element()
}

fn compact_navigation(page: ConnectionsPage, cx: &Context<Workbench>) -> impl IntoElement {
    let entity = cx.entity().downgrade();
    Button::new("settings-pages")
        .ghost()
        .small()
        .label("Browse settings")
        .icon(IconName::ChevronDown)
        .dropdown_menu(move |mut menu, _, _| {
            menu = menu.scrollable(true);
            for (group, pages) in SETTINGS_NAV {
                menu = menu.label(*group);
                for &target in *pages {
                    let entity = entity.clone();
                    menu = menu.item(
                        PopupMenuItem::new(target.label())
                            .checked(page == target)
                            .on_click(move |_, window, cx| {
                                let _ = entity.update(cx, |this, cx| {
                                    this.set_view(View::Connections(target), window, cx)
                                });
                            }),
                    );
                }
            }
            menu
        })
}

fn runtime_required(workbench: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let mut content = panel(
        colors,
        if workbench.connecting {
            "Starting ElizaOS…"
        } else if workbench.needs_workspace() {
            "Open a workspace first"
        } else {
            "ElizaOS is unavailable"
        },
    );
    if workbench.connecting {
        content.child(muted(
            colors,
            "Settings will load as soon as the runtime is ready.",
        ))
    } else if workbench.needs_workspace() {
        content.child(
            row().child(
                Button::new("settings-pick-workspace")
                    .primary()
                    .small()
                    .label("Open workspace…")
                    .disabled(workbench.choosing_workspace)
                    .on_click(cx.listener(|this, _, window, cx| this.choose_workspace(window, cx))),
            ),
        )
    } else {
        if let Some(error) = &workbench.error {
            content = content.child(notice(colors, error.clone(), true));
        }
        content.child(
            row().child(
                Button::new("settings-start-runtime")
                    .primary()
                    .small()
                    .label("Retry startup")
                    .on_click(cx.listener(|this, _, window, cx| this.connect(window, cx))),
            ),
        )
    }
}

fn input_field(
    workbench: &mut Workbench,
    key: &'static str,
    initial: &str,
    placeholder: &str,
    masked: bool,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Entity<InputState> {
    workbench
        .connections
        .fields
        .entry(key)
        .or_insert_with(|| {
            let input = cx.new(|cx| {
                InputState::new(window, cx)
                    .placeholder(placeholder.to_owned())
                    .default_value(initial.to_owned())
                    .masked(masked)
            });
            let changes = cx.subscribe(&input, |_, _, event, cx| {
                if matches!(event, InputEvent::Change) {
                    cx.notify();
                }
            });
            Field {
                input,
                _changes: changes,
            }
        })
        .input
        .clone()
}

fn value(workbench: &Workbench, key: &str, cx: &Context<Workbench>) -> String {
    workbench
        .connections
        .fields
        .get(key)
        .map(|entry| entry.input.read(cx).value().into())
        .unwrap_or_default()
}

fn field(label: &'static str, input: &Entity<InputState>, colors: &Palette, enabled: bool) -> Div {
    let caption = muted(colors, label);
    let caption = if enabled {
        let target = input.clone();
        caption
            .id(SharedString::from(format!(
                "settings-label:{:?}",
                input.entity_id()
            )))
            .cursor_pointer()
            .on_click(move |_, window, cx| target.update(cx, |state, cx| state.focus(window, cx)))
            .into_any_element()
    } else {
        caption.into_any_element()
    };
    column(4.).min_w_0().child(caption).child(
        Input::new(input)
            .focus_bordered(false)
            .disabled(!enabled)
            .w_full(),
    )
}

fn column(gap: f32) -> Div {
    div().flex().flex_col().gap(px(gap))
}

fn muted(colors: &Palette, text: impl Into<SharedString>) -> Div {
    div().text_sm().text_color(colors.muted).child(text.into())
}

fn panel(colors: &Palette, title: &'static str) -> Div {
    column(10.)
        .min_w_0()
        .px(px(16.))
        .py(px(12.))
        .border_b_1()
        .border_color(colors.divider)
        .child(div().font_weight(FontWeight::SEMIBOLD).child(title))
}

fn row() -> Div {
    div().flex().items_center().flex_wrap().gap(px(8.))
}

fn notice(colors: &Palette, message: impl Into<SharedString>, error: bool) -> Div {
    div()
        .rounded(colors.control_radius())
        .bg(colors.inset)
        .px(px(10.))
        .py(px(7.))
        .text_sm()
        .text_color(if error { colors.danger } else { colors.muted })
        .child(message.into())
}

fn read_status(workbench: &Workbench, path: &str, colors: &Palette) -> Option<Div> {
    if let Some(error) = workbench.control_error(path) {
        return Some(notice(colors, error.to_owned(), true));
    }
    workbench
        .control_pending(path)
        .then(|| notice(colors, "Loading…", false))
}

fn action_status(
    workbench: &Workbench,
    path: &str,
    success: &'static str,
    colors: &Palette,
) -> Option<Div> {
    if let Some(error) = workbench.control_action_error(path) {
        return Some(notice(colors, error.to_owned(), true));
    }
    if workbench.control_action_pending(path) {
        return Some(notice(colors, "Working…", false));
    }
    workbench
        .control_action_value(path)
        .map(|_| notice(colors, success, false))
}

fn request_action(
    id: impl Into<SharedString>,
    label: impl Into<SharedString>,
    enabled: bool,
    target: (ControlMethod, impl Into<String>),
    body: Option<Value>,
    refresh: &'static [&'static str],
    cx: &mut Context<Workbench>,
) -> Button {
    let (method, path) = target;
    let path = path.into();
    Button::new(id.into())
        .small()
        .label(label)
        .disabled(!enabled)
        .on_click(cx.listener(move |this, _, _, cx| {
            this.control_send(method, &path, body.clone(), refresh, cx)
        }))
}

fn values<'a>(value: Option<&'a Value>, key: &str) -> &'a [Value] {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn text_at<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a str> {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
}

fn flag(value: Option<&Value>, key: &str) -> bool {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_bool)
        .unwrap_or_default()
}
