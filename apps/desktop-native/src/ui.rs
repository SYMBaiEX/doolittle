use gpui::{
    AnyElement, Context, FontWeight, Render, Rgba, SharedString, Window, div, prelude::*, px, rgb,
};
use gpui_component::{
    ActiveTheme, Disableable, Selectable, Sizable,
    button::{Button, ButtonVariants},
    input::Input,
    text::TextView,
};

use crate::workbench::{AgentView, IdeView, NewConversation, View, Workbench};

#[derive(Clone, Copy)]
struct Palette {
    canvas: Rgba,
    rail: Rgba,
    inset: Rgba,
    raised: Rgba,
    divider: Rgba,
    text: Rgba,
    muted: Rgba,
    accent: Rgba,
    accent_ink: Rgba,
    positive: Rgba,
    danger: Rgba,
}

impl Palette {
    fn for_mode(dark: bool) -> Self {
        if dark {
            Self {
                canvas: rgb(0x141414),
                rail: rgb(0x1d1d1d),
                inset: rgb(0x111111),
                raised: rgb(0x242321),
                divider: rgb(0x363431),
                text: rgb(0xf1eeea),
                muted: rgb(0xb1aaa1),
                accent: rgb(0xff782f),
                accent_ink: rgb(0x1a120c),
                positive: rgb(0x84ce9b),
                danger: rgb(0xff8c83),
            }
        } else {
            Self {
                canvas: rgb(0xfdfbf8),
                rail: rgb(0xf2eee9),
                inset: rgb(0xf8f4ef),
                raised: rgb(0xffffff),
                divider: rgb(0xddd5cb),
                text: rgb(0x24201b),
                muted: rgb(0x655c53),
                accent: rgb(0xa9400a),
                accent_ink: rgb(0xffffff),
                positive: rgb(0x22753d),
                danger: rgb(0xa6352c),
            }
        }
    }
}

impl Render for Workbench {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let colors = Palette::for_mode(cx.theme().is_dark());
        let wide = window.viewport_size().width >= px(880.);
        let reveal_sidebar = wide || self.sidebar_open;
        let render_workbench = wide || !self.sidebar_open;
        div()
            .id("doolittle-window")
            .key_context("Doolittle")
            .on_action(cx.listener(|this, _: &NewConversation, window, cx| {
                this.start_conversation(window, cx);
            }))
            .on_action(cx.listener(|this, _: &AgentView, window, cx| {
                this.set_view(View::Agent, window, cx);
            }))
            .on_action(cx.listener(|this, _: &IdeView, window, cx| {
                this.set_view(View::Ide, window, cx);
            }))
            .flex()
            .flex_col()
            .size_full()
            .bg(colors.canvas)
            .text_color(colors.text)
            .child(self.header(wide, colors, cx))
            .child(
                div()
                    .flex()
                    .flex_1()
                    .min_h_0()
                    .min_w_0()
                    .when(reveal_sidebar, |this| {
                        this.child(self.sidebar(wide, colors, cx))
                    })
                    .when(render_workbench, |this| {
                        this.child(match self.view {
                            View::Agent => self.chat(colors, window, cx),
                            View::Ide => self.ide(colors, window, cx),
                        })
                    }),
            )
    }
}

impl Workbench {
    fn header(&self, wide: bool, colors: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        let status = if self.ready() {
            "Runtime ready"
        } else if self.connecting {
            "Starting runtime"
        } else if self.needs_workspace() {
            "Choose a workspace"
        } else {
            "Runtime unavailable"
        };
        div()
            .h(px(52.))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(12.))
            .px(px(14.))
            .bg(colors.rail)
            .border_b_1()
            .border_color(colors.divider)
            .when(!wide, |this| {
                this.child(
                    Button::new("sidebar-toggle")
                        .small()
                        .ghost()
                        .label(if self.sidebar_open {
                            "Close chats"
                        } else {
                            "Chats"
                        })
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.sidebar_open = !this.sidebar_open;
                            if !this.sidebar_open && this.view == View::Agent {
                                this.focus_composer(window, cx);
                            }
                            cx.notify();
                        })),
                )
            })
            .when(wide, |this| {
                this.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(9.))
                        .w(px(227.))
                        .child(
                            div()
                                .size(px(25.))
                                .flex()
                                .items_center()
                                .justify_center()
                                .rounded(px(5.))
                                .bg(colors.accent)
                                .text_color(colors.accent_ink)
                                .font_weight(FontWeight::BOLD)
                                .child("D"),
                        )
                        .child(
                            div()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_size(px(15.))
                                .child("Doolittle"),
                        ),
                )
            })
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(2.))
                    .p(px(3.))
                    .border_1()
                    .border_color(colors.divider)
                    .rounded(px(7.))
                    .bg(colors.inset)
                    .child(
                        mode_button("agent-mode", "Agent", self.view == View::Agent, colors)
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.sidebar_open = false;
                                this.set_view(View::Agent, window, cx);
                            })),
                    )
                    .child(
                        mode_button("ide-mode", "IDE", self.view == View::Ide, colors).on_click(
                            cx.listener(|this, _, window, cx| {
                                this.sidebar_open = false;
                                this.set_view(View::Ide, window, cx);
                            }),
                        ),
                    ),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .truncate()
                    .text_size(px(13.))
                    .text_color(colors.muted)
                    .child(self.workspace_title()),
            )
            .when(!self.ready() && !self.connecting, |this| {
                this.child(
                    Button::new("open-workspace")
                        .small()
                        .outline()
                        .label(if self.choosing_workspace {
                            "Opening…"
                        } else {
                            "Open folder"
                        })
                        .disabled(self.choosing_workspace)
                        .on_click(cx.listener(|this, _, _, cx| this.choose_workspace(cx))),
                )
            })
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(px(12.))
                    .text_color(colors.muted)
                    .child(div().size(px(6.)).rounded_full().bg(if self.ready() {
                        colors.positive
                    } else {
                        colors.muted
                    }))
                    .child(status),
            )
    }

    fn sidebar(&self, wide: bool, colors: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        let local_sessions = self.active.iter().filter(|(id, entry)| {
            *id == &self.selected
                || entry.title.is_some()
                || !entry.draft.is_empty()
                || entry.active_run.is_some()
        });
        let mut locals = local_sessions
            .filter(|(id, _)| {
                !self
                    .sessions
                    .iter()
                    .any(|session| &session.session_id == *id)
            })
            .collect::<Vec<_>>();
        locals.sort_by_key(|(id, _)| (*id).clone());
        div()
            .id("chat-sidebar")
            .flex()
            .flex_col()
            .min_h_0()
            .flex_none()
            .when(wide, |this| this.w(px(246.)))
            .when(!wide, |this| this.w_full())
            .bg(colors.rail)
            .border_r_1()
            .border_color(colors.divider)
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(8.))
                    .px(px(12.))
                    .py(px(11.))
                    .child(
                        div()
                            .text_size(px(13.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Conversations"),
                    )
                    .child(
                        Button::new("new-chat")
                            .small()
                            .outline()
                            .label("New chat")
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.start_conversation(window, cx);
                            })),
                    ),
            )
            .child(
                div()
                    .id("conversation-list")
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .gap(px(4.))
                    .px(px(9.))
                    .children(locals.into_iter().map(|(id, entry)| {
                        session_button(id, entry.title.as_deref(), id == &self.selected, colors, cx)
                    }))
                    .children(self.sessions.iter().map(|session| {
                        session_button(
                            &session.session_id,
                            session
                                .title
                                .as_deref()
                                .or_else(|| session.preview.first().map(String::as_str)),
                            session.session_id == self.selected,
                            colors,
                            cx,
                        )
                    })),
            )
            .when_some(self.session_error.as_ref(), |this, message| {
                this.child(
                    notice(message.clone(), colors.danger, colors)
                        .mx(px(9.))
                        .my(px(7.)),
                )
            })
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(5.))
                    .border_t_1()
                    .border_color(colors.divider)
                    .px(px(12.))
                    .py(px(9.))
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .text_xs()
                            .text_color(colors.muted)
                            .child("Local workspace"),
                    )
                    .child(
                        Button::new("reload-chats")
                            .small()
                            .ghost()
                            .label(if self.sessions_loading {
                                "Loading…"
                            } else {
                                "Reload"
                            })
                            .disabled(!self.ready() || self.sessions_loading)
                            .on_click(cx.listener(|this, _, _, cx| this.refresh_sessions(cx))),
                    ),
            )
    }

    fn chat(&self, colors: Palette, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let conversation = self.conversation();
        let title = conversation
            .title
            .clone()
            .unwrap_or_else(|| "New conversation".into());
        let has_run = conversation.active_run.is_some();
        let can_send = self.ready()
            && !self.composer.read(cx).value().trim().is_empty()
            && !conversation.loading_history;
        let modifier = if cfg!(target_os = "macos") {
            "⌘"
        } else {
            "Ctrl+"
        };
        let stopped = conversation
            .active_run
            .as_ref()
            .is_some_and(|run| run.interrupted);
        let history_action = if conversation.loading_history {
            "Loading history…"
        } else if conversation.history_error.is_some() {
            "Retry history"
        } else {
            "Earlier messages"
        };
        let title_strip = div()
            .flex_none()
            .h(px(49.))
            .flex()
            .items_center()
            .px(px(20.))
            .gap(px(10.))
            .border_b_1()
            .border_color(colors.divider)
            .child(
                div()
                    .min_w_0()
                    .flex_1()
                    .truncate()
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(title),
            )
            .when_some(conversation.active_run.as_ref(), |this, run| {
                this.child(
                    div()
                        .max_w(px(240.))
                        .truncate()
                        .text_xs()
                        .text_color(if stopped { colors.danger } else { colors.muted })
                        .child(run.status.clone()),
                )
            });
        let thread =
            div()
                .id("transcript")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .track_scroll(&self.transcript_scroll)
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .mx_auto()
                        .max_w(px(785.))
                        .w_full()
                        .px(px(24.))
                        .py(px(20.))
                        .gap(px(18.))
                        .when(
                            conversation.has_earlier
                                || conversation.history_error.is_some()
                                || conversation.loading_history,
                            |thread| {
                                thread.child(
                                    Button::new("earlier-messages")
                                        .small()
                                        .outline()
                                        .label(history_action)
                                        .disabled(has_run || conversation.loading_history)
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.load_history(this.conversation().has_earlier, cx);
                                        })),
                                )
                            },
                        )
                        .when_some(conversation.history_error.as_ref(), |thread, error| {
                            thread.child(notice(error.clone(), colors.danger, colors))
                        })
                        .when(conversation.messages.is_empty() && !has_run, |thread| {
                            thread.child(
                            div()
                                .flex()
                                .flex_col()
                                .gap(px(7.))
                                .py(px(52.))
                                .child(
                                    div()
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_size(px(26.))
                                        .child("What are we working on?"),
                                )
                                .child(div().text_color(colors.muted).child(
                                    "Ask a question or give Doolittle a task in this workspace.",
                                )),
                        )
                        })
                        .children(conversation.messages.iter().enumerate().map(
                            |(index, message)| {
                                message_row(
                                    &message.role,
                                    TextView::markdown(
                                        SharedString::from(format!(
                                            "{}:message-{index}",
                                            self.selected
                                        )),
                                        SharedString::from(message.text.clone()),
                                        window,
                                        cx,
                                    )
                                    .selectable(true),
                                    colors,
                                )
                            },
                        ))
                        .when_some(conversation.active_run.as_ref(), |thread, run| {
                            thread
                                .child(message_row("user", div().child(run.prompt.clone()), colors))
                                .child(message_row(
                                    "assistant",
                                    div().child(if run.reply.is_empty() {
                                        if run.interrupted {
                                            "Run status needs confirmation"
                                        } else {
                                            "Working…"
                                        }
                                        .to_owned()
                                    } else {
                                        run.reply.clone()
                                    }),
                                    colors,
                                ))
                        })
                        .when_some(conversation.error.as_ref(), |thread, error| {
                            thread.child(notice(error.clone(), colors.danger, colors).when(
                                conversation.recover_prompt.is_some(),
                                |notice| {
                                    notice.child(
                                        Button::new("restore-prompt")
                                            .small()
                                            .outline()
                                            .label("Restore prompt")
                                            .on_click(cx.listener(|this, _, window, cx| {
                                                this.restore_prompt(window, cx);
                                            })),
                                    )
                                },
                            ))
                        }),
                );

        div()
            .id("agent-workbench")
            .flex()
            .flex_col()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .child(title_strip)
            .child(thread)
            .child(
                div()
                    .flex_none()
                    .w_full()
                    .max_w(px(785.))
                    .mx_auto()
                    .px(px(24.))
                    .pb(px(18.))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(5.))
                            .rounded(px(9.))
                            .border_1()
                            .border_color(colors.divider)
                            .bg(colors.raised)
                            .py(px(6.))
                            .px(px(9.))
                            .child(Input::new(&self.composer).appearance(false).focus_bordered(false))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .gap(px(8.))
                                    .child(
                                        div()
                                            .min_w_0()
                                            .truncate()
                                            .text_xs()
                                            .text_color(colors.muted)
                                            .child(if self.connecting {
                                                "Starting the local runtime. You can draft while it loads.".to_owned()
                                            } else {
                                                format!("{modifier}Enter to send")
                                            }),
                                    )
                                    .when_some(conversation.active_run.as_ref(), |this, run| {
                                        this.child(
                                            div()
                                                .flex()
                                                .gap(px(5.))
                                                .when(run.interrupted, |actions| actions.child(
                                                    Button::new("resume-run").small().outline().label("Check run")
                                                        .on_click(cx.listener(|this, _, _, cx| this.resume_run(cx))),
                                                ))
                                                .when(run.started, |actions| actions.child(
                                                    Button::new("stop-run").small().outline()
                                                        .label(if run.cancelling { "Stopping…" } else { "Stop" })
                                                        .disabled(run.cancelling)
                                                        .on_click(cx.listener(|this, _, _, cx| this.cancel_run(cx))),
                                                )),
                                        )
                                    })
                                    .when(!has_run, |this| this.child(
                                        Button::new("send")
                                            .small()
                                            .primary()
                                            .label("Send")
                                            .disabled(!can_send)
                                            .when(can_send, |button| {
                                                button.bg(colors.accent).text_color(colors.accent_ink)
                                            })
                                            .on_click(cx.listener(|this, _, window, cx| this.send(window, cx))),
                                    )),
                            ),
                    )
                    .when_some(self.error.as_ref(), |this, error| {
                        this.child(
                            notice(error.clone(), colors.danger, colors)
                                .mt(px(8.))
                                .child(Button::new("retry-runtime").small().outline().label("Retry runtime")
                                    .on_click(cx.listener(|this, _, _, cx| this.connect(cx)))),
                        )
                    }),
            )
            .into_any_element()
    }

    fn ide(&self, colors: Palette, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let narrow = window.viewport_size().width < px(700.);
        let explorer = self.explorer_open;
        let current = self.workspace.selected.clone();
        let shown_entries = self.workspace.entries.iter().filter(|entry| {
            !self.workspace.collapsed.iter().any(|folder| {
                entry
                    .path
                    .strip_prefix(folder)
                    .is_some_and(|rest| rest.starts_with('/'))
            })
        });
        div()
            .id("ide-workbench")
            .flex()
            .flex_col()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .child(
                div()
                    .flex_none()
                    .flex()
                    .gap(px(9.))
                    .items_center()
                    .h(px(48.))
                    .px(px(12.))
                    .border_b_1()
                    .border_color(colors.divider)
                    .bg(colors.rail)
                    .child(
                        Button::new("explorer-toggle").small().ghost()
                            .label(if explorer { "Hide files" } else { "Files" })
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.explorer_open = !explorer;
                                cx.notify();
                            })),
                    )
                    .child(div().flex_1().min_w_0().truncate().text_sm().child(self.workspace_path()))
                    .child(
                        Button::new("refresh-files").small().outline()
                            .label(if self.workspace.loading_tree { "Loading…" } else { "Refresh" })
                            .disabled(!self.ready() || self.workspace.loading_tree)
                            .on_click(cx.listener(|this, _, _, cx| this.refresh_workspace(cx))),
                    ),
            )
            .when_some(self.workspace.error.as_ref(), |this, error| {
                this.child(notice(error.clone(), colors.danger, colors).m(px(10.)))
            })
            .when_some(self.error.as_ref(), |this, error| {
                this.child(
                    notice(error.clone(), colors.danger, colors).m(px(10.))
                        .child(Button::new("retry-ide-runtime").small().outline().label("Retry runtime")
                            .on_click(cx.listener(|this, _, _, cx| this.connect(cx)))),
                )
            })
            .child(
                div()
                    .flex()
                    .flex_1()
                    .min_w_0()
                    .min_h_0()
                    .when(explorer, |workbench| workbench.child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_none()
                            .min_h_0()
                            .when(narrow, |this| this.w_full())
                            .when(!narrow, |this| this.w(px(228.)))
                            .bg(colors.rail)
                            .border_r_1()
                            .border_color(colors.divider)
                            .child(div().px(px(11.)).py(px(10.)).text_xs().text_color(colors.muted).child("Explorer"))
                            .child(
                                div().id("file-explorer").flex_1().min_h_0().overflow_y_scroll()
                                    .children(shown_entries.enumerate().map(|(index, entry)| {
                                        let leaf = entry.path.rsplit('/').next().unwrap_or(&entry.path);
                                        let folder = entry.kind == "directory";
                                        let label = if folder {
                                            format!("{} {leaf}", if self.workspace.collapsed.contains(&entry.path) { "›" } else { "⌄" })
                                        } else { leaf.to_owned() };
                                        let path = entry.path.clone();
                                        let selected = current.as_deref() == Some(entry.path.as_str());
                                        div().pl(px(6. + f32::from(entry.depth.min(10)) * 12.))
                                            .pr(px(6.))
                                            .child(
                                                Button::new(("workspace-entry", index)).small().ghost().w_full().justify_start()
                                                    .selected(selected).label(SharedString::from(label))
                                                    .on_click(cx.listener(move |this, _, _, cx| {
                                                        if folder {
                                                            if !this.workspace.collapsed.remove(&path) {
                                                                this.workspace.collapsed.insert(path.clone());
                                                            }
                                                            cx.notify();
                                                        } else {
                                                            if narrow {
                                                                this.explorer_open = false;
                                                            }
                                                            this.open_file(path.clone(), cx);
                                                        }
                                                    })),
                                            )
                                    }))
                                    .when(self.workspace.entries.is_empty() && !self.workspace.loading_tree, |list| {
                                        list.child(div().p(px(12.)).text_sm().text_color(colors.muted).child(
                                            if self.ready() { "No files available" } else { "Connect the local runtime to browse files." },
                                        ))
                                    }),
                            )
                            .when(self.workspace.truncated, |this| {
                                this.child(div().p(px(10.)).text_xs().text_color(colors.muted)
                                    .child("Some entries are outside the current tree limit."))
                            }),
                    ))
                    .when(!narrow || !explorer, |workbench| workbench.child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w_0()
                            .min_h_0()
                            .child(
                                div()
                                    .flex_none()
                                    .flex()
                                    .items_center()
                                    .h(px(38.))
                                    .gap(px(12.))
                                    .px(px(14.))
                                    .border_b_1()
                                    .border_color(colors.divider)
                                    .child(div().flex_1().truncate().text_sm().child(current.clone().unwrap_or_else(|| "No open file".into())))
                                    .child(div().text_xs().text_color(colors.muted).child("Read only")),
                            )
                            .child(
                                div().id("file-document").flex_1().min_h_0().min_w_0().overflow_y_scroll()
                                    .p(px(12.))
                                    .when_some(self.workspace.file.as_ref(), |this, source| {
                                        this.child(
                                            TextView::markdown(
                                                SharedString::from(format!("{}:open:{}", self.selected, current.as_deref().unwrap_or(""))),
                                                fence_code(source, current.as_deref().unwrap_or("")),
                                                window,
                                                cx,
                                            )
                                            .selectable(true),
                                        )
                                    })
                                    .when(self.workspace.file.is_none(), |this| {
                                        this.child(div().text_color(colors.muted).text_sm().child(
                                            if self.workspace.loading_file { "Reading file…" } else { "Choose a file from Explorer." },
                                        ))
                                    }),
                            ),
                    )),
            )
            .into_any_element()
    }
}

fn mode_button(id: &'static str, label: &'static str, selected: bool, colors: Palette) -> Button {
    let button = Button::new(id)
        .small()
        .ghost()
        .label(label)
        .selected(selected);
    if selected {
        button
            .bg(colors.raised)
            .border_1()
            .border_color(colors.divider)
            .text_color(colors.text)
    } else {
        button.text_color(colors.muted)
    }
}

fn session_button(
    id: &str,
    title: Option<&str>,
    selected: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Button {
    let title = title.filter(|title| !title.trim().is_empty());
    let button_label = title
        .unwrap_or("New conversation")
        .chars()
        .take(32)
        .collect::<String>();
    let title = title.map(str::to_owned);
    let selected_session = id.to_owned();
    Button::new(SharedString::from(format!("session-{id}")))
        .small()
        .ghost()
        .w_full()
        .justify_start()
        .label(SharedString::from(button_label))
        .selected(selected)
        .when(selected, |this| {
            this.bg(colors.raised).text_color(colors.text)
        })
        .on_click(cx.listener(move |this, _, window, cx| {
            this.select_conversation(selected_session.clone(), title.clone(), window, cx);
        }))
}

fn message_row(role: &str, content: impl IntoElement, colors: Palette) -> impl IntoElement {
    let title = match role {
        "user" => "You",
        "assistant" => "Doolittle",
        "tool" => "Tool",
        _ => "System",
    };
    div()
        .flex()
        .flex_col()
        .gap(px(7.))
        .text_color(colors.text)
        .child(
            div()
                .text_xs()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(colors.muted)
                .child(title),
        )
        .child(
            div()
                .min_w_0()
                .map(|this| {
                    if role == "user" {
                        this.bg(colors.raised)
                            .rounded(px(7.))
                            .px(px(12.))
                            .py(px(9.))
                    } else {
                        this
                    }
                })
                .child(content),
        )
}

fn notice(message: String, color: Rgba, palette: Palette) -> gpui::Div {
    div()
        .flex()
        .gap(px(9.))
        .items_center()
        .p(px(9.))
        .rounded(px(6.))
        .border_1()
        .border_color(palette.divider)
        .text_color(color)
        .bg(palette.inset)
        .child(div().text_sm().flex_1().min_w_0().child(message))
}

fn fence_code(text: &str, path: &str) -> SharedString {
    let language = match path.rsplit('.').next().unwrap_or("") {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" => "javascript",
        "json" => "json",
        "py" => "python",
        "yaml" | "yml" => "yaml",
        "css" => "css",
        "sh" => "bash",
        _ => "text",
    };
    let longest = text
        .split(|c| c != '`')
        .map(str::len)
        .max()
        .unwrap_or_default();
    let fence = "`".repeat((longest + 1).max(3));
    SharedString::from(format!("{fence}{language}\n{text}\n{fence}"))
}

#[cfg(test)]
mod tests {
    use super::fence_code;
    use markdown::{ParseOptions, mdast::Node, to_mdast};

    #[test]
    fn source_with_backticks_cannot_end_its_code_block() {
        let source = "`````\n![tracker](https://example.test/remote)\n```";
        let rendered = fence_code(source, "example.rs");
        let Node::Root(root) = to_mdast(rendered.as_ref(), &ParseOptions::gfm()).unwrap() else {
            panic!("expected Markdown document");
        };
        let [Node::Code(code)] = root.children.as_slice() else {
            panic!("source escaped the code block");
        };
        assert_eq!(code.value, source);
    }
}
