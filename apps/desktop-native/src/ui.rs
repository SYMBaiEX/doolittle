use gpui::{
    AnyElement, Context, FontWeight, Render, Rgba, SharedString, Window, div, prelude::*, px,
};
use gpui_component::{
    Disableable, Root, Selectable, Sizable,
    button::{Button, ButtonVariants},
    input::Input,
    text::TextView,
};

pub(crate) use crate::themes::Palette;
use crate::{
    connections::{self, ConnectionsPage},
    navigation::DESTINATIONS,
    operations, session_transfer,
    themes::Surface,
    workbench::{AgentView, IdeView, NewConversation, OpenNavigation, SaveFile, View, Workbench},
    workspace_tools,
};

impl Render for Workbench {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let colors = Palette::current(cx);
        let file_dirty = self
            .workspace
            .file
            .as_ref()
            .is_some_and(|file| file.is_dirty(cx));
        window.set_window_edited(file_dirty);
        let wide = window.viewport_size().width >= px(880.);
        let compact = self.view == View::Ide || colors.compact_navigation();
        let reveal_sidebar = self.sidebar_open || (wide && !compact);
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
            .on_action(cx.listener(|this, _: &SaveFile, _, cx| {
                if this.view == View::Ide {
                    this.save_file(cx);
                }
            }))
            .on_action(
                cx.listener(|this, _: &OpenNavigation, window, cx| {
                    this.open_navigation(window, cx)
                }),
            )
            .flex()
            .flex_col()
            .size_full()
            .relative()
            .bg(colors.canvas)
            .child(colors.canvas_backdrop())
            .gap(colors.frame_gap())
            .p(colors.frame_gap())
            .font_family(colors.body_family())
            .text_size(colors.control_size())
            .text_color(colors.text)
            .child(self.header(wide, colors, cx))
            .child(
                div()
                    .flex()
                    .gap(colors.frame_gap())
                    .flex_1()
                    .min_h_0()
                    .min_w_0()
                    .when(reveal_sidebar, |this| {
                        this.child(self.sidebar(wide, colors, cx))
                    })
                    .when(render_workbench, |this| {
                        this.child(
                            colors
                                .surface(div(), Surface::Panel)
                                .flex()
                                .flex_1()
                                .min_h_0()
                                .min_w_0()
                                .overflow_hidden()
                                .child(match self.view {
                                    View::Agent => self.chat(colors, window, cx),
                                    View::Ide => self.ide(colors, file_dirty, window, cx),
                                    View::Operations(page) => {
                                        operations::render(page, self, &colors, window, cx)
                                    }
                                    View::Connections(page) => {
                                        connections::render(page, self, &colors, window, cx)
                                    }
                                }),
                        )
                    }),
            )
            .children(Root::render_dialog_layer(window, cx))
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
        colors
            .surface(div(), Surface::Header)
            .h(colors.header_height())
            .flex_none()
            .flex()
            .items_center()
            .gap(px(12.))
            .px(px(14.))
            .border_b_1()
            .border_color(colors.divider)
            .when(
                !wide || self.view == View::Ide || colors.compact_navigation(),
                |this| {
                    this.child(
                        Button::new("sidebar-toggle")
                            .small()
                            .ghost()
                            .label(if self.sidebar_open {
                                "Close menu"
                            } else {
                                "Menu"
                            })
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.sidebar_open = !this.sidebar_open;
                                if !this.sidebar_open && this.view == View::Agent {
                                    this.focus_composer(window, cx);
                                }
                                cx.notify();
                            })),
                    )
                },
            )
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
            .when(!self.connecting, |this| {
                this.child(
                    Button::new("open-workspace")
                        .small()
                        .outline()
                        .label(if self.choosing_workspace {
                            "Opening…"
                        } else if wide && !self.needs_workspace() {
                            "New workspace"
                        } else {
                            "Open folder"
                        })
                        .disabled(self.choosing_workspace)
                        .on_click(cx.listener(|this, _, _, cx| this.choose_workspace(cx))),
                )
            })
            .when(wide, |this| {
                this.child(
                    Button::new("open-navigation")
                        .small()
                        .ghost()
                        .label("Go to…")
                        .on_click(
                            cx.listener(|this, _, window, cx| this.open_navigation(window, cx)),
                        ),
                )
            })
            .when(wide, |header| {
                header.child(
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
            })
    }

    fn sidebar(&self, wide: bool, colors: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        let local_sessions = self.active.iter().filter(|(id, entry)| {
            *id == &self.selected
                || entry.title.is_some()
                || !entry.draft.is_empty()
                || !entry.draft_attachments.is_empty()
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
        colors
            .surface(div(), Surface::Navigation)
            .id("chat-sidebar")
            .flex()
            .flex_col()
            .min_h_0()
            .flex_none()
            .when(wide, |this| this.w(colors.navigation_width()))
            .when(!wide, |this| this.w_full())
            .border_r_1()
            .border_color(colors.divider)
            .child(self.destinations(colors, cx))
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
                    .gap(colors.row_space() / 2.)
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
            .child(session_transfer::controls(self, colors, cx))
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

    fn destinations(&self, colors: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .flex_wrap()
            .gap(px(3.))
            .px(px(10.))
            .py(px(10.))
            .border_b_1()
            .border_color(colors.divider)
            .children(DESTINATIONS.iter().map(|&(label, view)| {
                let selected = self.view == view
                    || matches!(
                        (view, self.view),
                        (View::Connections(_), View::Connections(_))
                    );
                mode_button(label, label, selected, colors)
                    .justify_start()
                    .min_w(px(95.))
                    .on_click(
                        cx.listener(move |this, _, window, cx| this.set_view(view, window, cx)),
                    )
            }))
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
            && !conversation.loading_history
            && !conversation.choosing_attachments;
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
        let thread = div()
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
                    .max_w(colors.reading_width())
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
                                        .font_family(colors.display_family())
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_size(px(26.))
                                        .child("What are we working on?"),
                                )
                                .child(div().text_color(colors.muted).child(
                                    "Ask a question or give Doolittle a task in this workspace.",
                                )),
                        )
                    })
                    .children(
                        conversation
                            .messages
                            .iter()
                            .enumerate()
                            .map(|(index, message)| {
                                let content = div()
                                    .flex()
                                    .flex_col()
                                    .gap(px(8.))
                                    .child(
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
                                    )
                                    .children(message.attachments.iter().map(|file| {
                                        div().text_xs().text_color(colors.muted).child(format!(
                                            "{} · {} KB",
                                            file.name,
                                            file.size_bytes.div_ceil(1024)
                                        ))
                                    }))
                                    .children(
                                        message.wallet_activities.iter().enumerate().filter_map(
                                            |(receipt_index, receipt)| {
                                                connections::wallet::render(
                                                    receipt,
                                                    format!("wallet:{index}:{receipt_index}"),
                                                    &colors,
                                                    cx,
                                                )
                                            },
                                        ),
                                    );
                                message_row(&message.role, content, colors)
                            }),
                    )
                    .when_some(conversation.active_run.as_ref(), |thread, run| {
                        thread
                            .child(message_row(
                                "user",
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap(px(6.))
                                    .child(run.prompt.clone())
                                    .children(run.attachments.iter().map(|file| {
                                        div()
                                            .text_xs()
                                            .text_color(colors.muted)
                                            .child(file.name.clone())
                                    })),
                                colors,
                            ))
                            .child(message_row(
                                "assistant",
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap(px(8.))
                                    .child(if run.reply.is_empty() {
                                        div()
                                            .child(if run.interrupted {
                                                "Run status needs confirmation"
                                            } else {
                                                "Working…"
                                            })
                                            .into_any_element()
                                    } else {
                                        TextView::markdown(
                                            SharedString::from(format!("{}:live", run.id)),
                                            SharedString::from(
                                                crate::markdown_text::for_transcript(&run.reply),
                                            ),
                                            window,
                                            cx,
                                        )
                                        .selectable(true)
                                        .into_any_element()
                                    })
                                    .children(run.wallet_activities.iter().enumerate().filter_map(
                                        |(index, receipt)| {
                                            connections::wallet::render(
                                                receipt,
                                                format!("{}:wallet:{index}", run.id),
                                                &colors,
                                                cx,
                                            )
                                        },
                                    )),
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
                    .max_w(colors.reading_width())
                    .mx_auto()
                    .px(px(24.))
                    .pb(px(18.))
                    .child(
                        colors.surface(div(), Surface::Composer)
                            .flex()
                            .flex_col()
                            .gap(px(5.))
                            .py(px(6.))
                            .px(px(9.))
                            .when(!conversation.draft_attachments.is_empty(), |composer| composer.child(
                                div().flex().flex_wrap().gap(px(5.)).children(
                                    conversation.draft_attachments.iter().map(|file| {
                                        let id = file.id.clone();
                                        div().flex().items_center().gap(px(5.)).px(px(7.)).rounded(px(6.))
                                            .border_1().border_color(colors.divider)
                                            .child(div().max_w(px(180.)).truncate().text_xs().child(file.name.clone()))
                                            .child(Button::new(SharedString::from(format!("remove-attachment:{id}"))).small().ghost().label("Remove")
                                                .on_click(cx.listener(move |this, _, _, cx| this.remove_draft_attachment(&id, cx))))
                                    }),
                                ),
                            ))
                            .child(Input::new(&self.composer).appearance(false).focus_bordered(false))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .gap(px(8.))
                                    .child(Button::new("attach-files").small().ghost()
                                        .label(if conversation.choosing_attachments { "Attaching…" } else { "Attach" })
                                        .disabled(has_run || !self.ready() || conversation.choosing_attachments || conversation.draft_attachments.len() >= 8)
                                        .on_click(cx.listener(|this, _, _, cx| this.choose_attachments(cx))))
                                    .child(Button::new("chat-model-settings").small().ghost().label("Model")
                                        .on_click(cx.listener(|this, _, window, cx| this.set_view(View::Connections(ConnectionsPage::Models), window, cx))))
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

    fn ide(
        &self,
        colors: Palette,
        dirty: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let narrow = window.viewport_size().width < px(700.);
        let explorer = self.explorer_open;
        let file = self.workspace.file.as_ref();
        let current = file.map(|file| file.path.as_str());
        let loading = self.workspace.loading_file.is_some();
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
                colors.surface(div(), Surface::Header)
                    .flex_none()
                    .flex()
                    .gap(px(9.))
                    .items_center()
                    .h(px(48.))
                    .px(px(12.))
                    .border_b_1()
                    .border_color(colors.divider)
                    .child(
                        Button::new("explorer-toggle").small().ghost()
                            .label(if explorer { "Hide files" } else { "Files" })
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.explorer_open = !explorer;
                                cx.notify();
                            })),
                    )
                    .child(div().flex_1().min_w_0().truncate().text_sm().child(self.workspace_path()))
                    .child(workspace_tools::toolbar(self, cx))
                    .child(
                        Button::new("refresh-files").small().outline()
                            .label(if self.workspace.loading_tree { "Loading…" } else { "Refresh files" })
                            .disabled(!self.ready() || self.workspace.loading_tree)
                            .on_click(cx.listener(|this, _, _, cx| this.refresh_workspace(cx))),
                    ),
            )
            .when_some(self.workspace.error.as_ref(), |this, error| {
                this.child(notice(error.clone(), colors.danger, colors).m(px(10.)))
            })
            .when_some(self.workspace.file_error.as_ref(), |this, error| {
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
                        colors.surface(div(), Surface::Navigation)
                            .flex()
                            .flex_col()
                            .flex_none()
                            .min_h_0()
                            .when(narrow, |this| this.w_full())
                            .when(!narrow, |this| this.w(px(228.)))
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
                                        let selected = current == Some(entry.path.as_str());
                                        div().pl(px(6. + f32::from(entry.depth.min(10)) * 12.))
                                            .pr(px(6.))
                                            .child(
                                                Button::new(("workspace-entry", index)).small().ghost().w_full().justify_start()
                                                    .selected(selected).label(SharedString::from(label))
                                                    .disabled(loading && !folder)
                                                    .on_click(cx.listener(move |this, _, window, cx| {
                                                        if folder {
                                                            if !this.workspace.collapsed.remove(&path) {
                                                                this.workspace.collapsed.insert(path.clone());
                                                            }
                                                            cx.notify();
                                                        } else {
                                                            this.open_file(path.clone(), narrow, window, cx);
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
                                    .child(div().flex_1().truncate().text_sm().child(current.unwrap_or("No open file").to_owned()))
                                    .when_some(file, |header, file| {
                                        header
                                            .when(dirty || file.stale || loading, |header| {
                                                header.child(div().text_xs().text_color(colors.muted)
                                                    .child(if loading { "Reading…" } else if file.stale { "Changed on disk" } else { "Unsaved" }))
                                            })
                                            .child(Button::new("reload-file").small().ghost()
                                                .label("Reload file")
                                                .disabled(loading || file.saving)
                                                .on_click(cx.listener(|this, _, window, cx| this.reload_file(window, cx))))
                                            .child(Button::new("save-file").small().outline()
                                                .label(if file.saving { "Saving…" } else { "Save" })
                                                .disabled(loading || !dirty || file.saving || file.stale)
                                                .on_click(cx.listener(|this, _, _, cx| this.save_file(cx))))
                                    }),
                            )
                            .child(
                                colors.surface(div(), Surface::Editor).id("file-document").flex_1().min_h_0().min_w_0().overflow_hidden()
                                    .when_some(file, |this, file| {
                                        this.child(
                                            Input::new(&file.editor).w_full().h_full()
                                                .appearance(false).focus_bordered(false).disabled(loading),
                                        )
                                    })
                                    .when(file.is_none(), |this| {
                                        this.child(div().p(px(12.)).text_color(colors.muted).text_sm().child(
                                            if loading { "Reading file…" } else { "Choose a file from Explorer." },
                                        ))
                                    }),
                            ),
                    )),
            )
            .children(workspace_tools::render(self, colors, window, cx))
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
                    if role == "user" || colors.has_panel_material() {
                        colors
                            .surface(this, Surface::Message)
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
