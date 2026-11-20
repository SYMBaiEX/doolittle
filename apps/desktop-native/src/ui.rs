use gpui::{
    AnyElement, Context, FontWeight, Render, Rgba, SharedString, Window, div, prelude::*, px,
};
use gpui_component::{
    Disableable, IconName, Root, Selectable, Sizable,
    button::{Button, ButtonVariants},
    input::Input,
    text::TextView,
};

pub(crate) use crate::themes::Palette;
use crate::{
    connections::{self, ConnectionsPage},
    navigation::DESTINATIONS,
    operations,
    panes::{PRIMARY_PANE, PaneResize, SplitDirection},
    session_transfer,
    themes::Surface,
    workbench::{
        AgentView, IdeView, NewConversation, OpenNavigation, OpenSettings, OpenWorkspace, SaveFile,
        SendMessage, ToggleSidebar, View, Workbench,
    },
    workspace_tools,
};

impl Render for Workbench {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let colors = Palette::current(cx);
        if self.is_auxiliary_pane() {
            return div()
                .id("doolittle-conversation-pane")
                .key_context("Doolittle")
                .on_action(cx.listener(|this, _: &SendMessage, window, cx| {
                    cx.stop_propagation();
                    this.send_from_composer(window, cx);
                }))
                .on_action(cx.listener(|this, _: &NewConversation, window, cx| {
                    cx.stop_propagation();
                    this.start_conversation(window, cx);
                }))
                .on_action(cx.listener(|this, _: &OpenNavigation, window, cx| {
                    cx.stop_propagation();
                    this.open_navigation(window, cx);
                }))
                .flex()
                .size_full()
                .min_w_0()
                .min_h_0()
                .overflow_hidden()
                .text_color(colors.text)
                .child(self.chat(colors, window, cx))
                .into_any_element();
        }
        let file_dirty = self
            .workspace
            .file
            .as_ref()
            .is_some_and(|file| file.is_dirty(cx));
        window.set_window_edited(self.has_unsaved_files(cx));
        let wide = self.wide_sidebar(window);
        let reveal_sidebar = self.sidebar_visible(window);
        let render_workbench = wide || !reveal_sidebar;
        workspace_tools::sync_native_preview(
            self,
            window,
            cx,
            render_workbench && self.view == View::Ide,
        );
        div()
            .id("doolittle-window")
            .key_context("Doolittle")
            .track_focus(&self.shell_focus)
            .on_action(cx.listener(|this, _: &SendMessage, window, cx| {
                this.send_from_composer(window, cx);
            }))
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
            .on_action(cx.listener(|this, _: &OpenWorkspace, window, cx| {
                this.choose_workspace(window, cx);
            }))
            .on_action(cx.listener(|this, _: &OpenSettings, window, cx| {
                this.set_view(View::Connections(ConnectionsPage::Appearance), window, cx);
            }))
            .on_action(cx.listener(|this, _: &ToggleSidebar, window, cx| {
                this.toggle_sidebar(window, cx);
            }))
            .flex()
            .flex_col()
            .size_full()
            .relative()
            .bg(colors.canvas)
            .child(colors.canvas_backdrop())
            .font_family(colors.body_family())
            .text_size(colors.control_size())
            .text_color(colors.text)
            .child(self.header(wide, reveal_sidebar, colors, cx))
            .when_some(self.migration_notice.as_ref(), |this, message| {
                this.child(
                    notice(message.clone(), colors.muted, colors).child(
                        Button::new("dismiss-migration")
                            .ghost()
                            .small()
                            .label("Dismiss")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.migration_notice = None;
                                cx.notify();
                            })),
                    ),
                )
            })
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
                        this.child(
                            colors
                                .surface(div(), Surface::Panel)
                                .flex()
                                .flex_1()
                                .min_h_0()
                                .min_w_0()
                                .overflow_hidden()
                                .child(match self.view {
                                    View::Agent | View::Ide if !self.ready() => {
                                        self.workspace_entry(colors, cx).into_any_element()
                                    }
                                    View::Agent => self.conversation_panes(colors, window, cx),
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
            .into_any_element()
    }
}

impl Workbench {
    fn header(
        &self,
        wide: bool,
        sidebar: bool,
        colors: Palette,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let workspace = self.workspace_title();
        let folder = self.workspace_path();
        colors
            .surface(div(), Surface::Header)
            .h(colors.header_height())
            .flex_none()
            .flex()
            .items_center()
            .gap(px(8.))
            .px(px(12.))
            .border_b_1()
            .border_color(colors.divider)
            .child(
                Button::new("sidebar-toggle")
                    .small()
                    .ghost()
                    .icon(if sidebar {
                        IconName::PanelLeftClose
                    } else {
                        IconName::PanelLeftOpen
                    })
                    .tooltip(if sidebar {
                        "Hide sidebar"
                    } else {
                        "Show sidebar"
                    })
                    .on_click(cx.listener(|this, _, window, cx| this.toggle_sidebar(window, cx))),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .flex_1()
                    .min_w_0()
                    .overflow_hidden()
                    .child(
                        Button::new("open-workspace")
                            .small()
                            .ghost()
                            .icon(IconName::FolderOpen)
                            .label(if self.choosing_workspace {
                                "Opening…".into()
                            } else if self.needs_workspace() {
                                "Open folder".into()
                            } else {
                                workspace
                            })
                            .tooltip(folder)
                            .disabled(self.choosing_workspace || self.connecting)
                            .on_click(
                                cx.listener(|this, _, window, cx| {
                                    this.choose_workspace(window, cx)
                                }),
                            ),
                    ),
            )
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(2.))
                    .p(px(2.))
                    .border_1()
                    .border_color(colors.divider)
                    .rounded(px(7.))
                    .bg(colors.inset)
                    .child(
                        mode_button("agent-mode", "Agent", self.view == View::Agent, colors)
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.set_view(View::Agent, window, cx)
                            })),
                    )
                    .child(
                        mode_button("ide-mode", "IDE", self.view == View::Ide, colors).on_click(
                            cx.listener(|this, _, window, cx| this.set_view(View::Ide, window, cx)),
                        ),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_1()
                    .min_w_0()
                    .gap(px(4.))
                    .items_center()
                    .justify_end()
                    .when(wide && self.connecting, |this| {
                        this.child(
                            div()
                                .truncate()
                                .text_xs()
                                .text_color(colors.muted)
                                .child("Starting ElizaOS…"),
                        )
                    })
                    .child(
                        Button::new("open-navigation")
                            .small()
                            .ghost()
                            .icon(IconName::Search)
                            .tooltip("Go to a page or chat")
                            .on_click(
                                cx.listener(|this, _, window, cx| this.open_navigation(window, cx)),
                            ),
                    )
                    .child(
                        Button::new("open-settings")
                            .small()
                            .ghost()
                            .icon(IconName::Settings)
                            .tooltip("Settings")
                            .selected(matches!(self.view, View::Connections(_)))
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.set_view(
                                    View::Connections(ConnectionsPage::Appearance),
                                    window,
                                    cx,
                                )
                            })),
                    ),
            )
    }

    fn workspace_entry(&self, colors: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        let (heading, detail) = if self.connecting {
            (
                "Starting ElizaOS",
                "Loading the conversations and tools for this workspace.",
            )
        } else if self.needs_workspace() {
            (
                "Start with a workspace",
                "Open a project to work with its files and tools, or use a personal workspace for everyday chat.",
            )
        } else {
            (
                "Couldn’t start this workspace",
                "Retry ElizaOS or open another folder.",
            )
        };
        div()
            .id("workspace-entry")
            .flex_1()
            .min_h_0()
            .min_w_0()
            .overflow_y_scroll()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .w_full()
                    .min_h_full()
                    .items_center()
                    .justify_center()
                    .p(px(24.))
                    .child(
                        div()
                            .w_full()
                            .max_w(px(490.))
                            .flex()
                            .flex_col()
                            .gap(px(14.))
                            .child(
                                div()
                                    .font_family(colors.display_family())
                                    .text_size(px(30.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child(heading),
                            )
                            .child(
                                div()
                                    .max_w(px(435.))
                                    .text_sm()
                                    .text_color(colors.muted)
                                    .child(detail),
                            )
                            .when_some(
                                self.error.as_ref().filter(|_| !self.connecting),
                                |this, error| {
                                    this.child(notice(error.clone(), colors.danger, colors))
                                },
                            )
                            .when(!self.connecting, |this| {
                                this.child(
                                    div()
                                        .flex()
                                        .flex_wrap()
                                        .gap(px(8.))
                                        .mt(px(5.))
                                        .when(!self.needs_workspace(), |row| {
                                            row.child(
                                                Button::new("entry-retry")
                                                    .primary()
                                                    .label("Retry")
                                                    .on_click(cx.listener(
                                                        |this, _, window, cx| {
                                                            this.connect(window, cx)
                                                        },
                                                    )),
                                            )
                                        })
                                        .child(
                                            Button::new("entry-open-folder")
                                                .icon(IconName::FolderOpen)
                                                .label("Open folder…")
                                                .map(|button| {
                                                    if self.needs_workspace() {
                                                        button.primary()
                                                    } else {
                                                        button.outline()
                                                    }
                                                })
                                                .disabled(self.choosing_workspace)
                                                .on_click(cx.listener(|this, _, window, cx| {
                                                    this.choose_workspace(window, cx)
                                                })),
                                        )
                                        .child(
                                            Button::new("entry-personal")
                                                .ghost()
                                                .label("Use personal workspace")
                                                .disabled(self.choosing_workspace)
                                                .on_click(cx.listener(|this, _, window, cx| {
                                                    this.open_personal_workspace(window, cx)
                                                })),
                                        ),
                                )
                            }),
                    ),
            )
    }

    fn conversation_panes(
        &self,
        colors: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        if self.content_width(window, cx) < px(880.) {
            let selected = self.pane_layout.focused();
            if selected != PRIMARY_PANE
                && let Some(pane) = self.pane_entities.get(&selected)
            {
                return pane.clone().into_any_element();
            }
            return self.chat(colors, window, cx);
        }
        let host = cx.entity().downgrade();
        let resize: PaneResize = std::rc::Rc::new(move |split, sizes, cx| {
            let _ = host.update(cx, |host, cx| host.resize_panes(split, sizes, cx));
        });
        self.pane_layout.render(
            self.chat(colors, window, cx),
            |id| {
                self.pane_entities.get(&id).map_or_else(
                    || div().into_any_element(),
                    |pane| pane.clone().into_any_element(),
                )
            },
            Some(&resize),
        )
    }

    fn sidebar(&self, wide: bool, colors: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        let mut locals = self
            .active
            .iter()
            .filter(|(id, entry)| {
                (*id == &self.selected
                    || entry.title.is_some()
                    || !entry.draft.is_empty()
                    || !entry.draft_attachments.is_empty()
                    || entry.active_run.is_some()
                    || self.editor_file_name(id).is_some())
                    && !self
                        .sessions
                        .iter()
                        .any(|session| &session.session_id == *id)
            })
            .collect::<Vec<_>>();
        locals.sort_by_key(|(id, _)| (*id != &self.selected, (*id).clone()));
        colors
            .surface(div(), Surface::Navigation)
            .id("chat-sidebar")
            .flex()
            .flex_col()
            .min_h_0()
            .min_w_0()
            .flex_none()
            .when(wide, |this| {
                this.w(colors.navigation_width())
                    .border_r_1()
                    .border_color(colors.divider)
            })
            .when(!wide, |this| this.w_full())
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .p(px(9.))
                    .border_b_1()
                    .border_color(colors.divider)
                    .children([("Chats", false), ("Tools", true)].map(|(label, tools)| {
                        mode_button(label, label, self.show_tools == tools, colors)
                            .flex_1()
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.show_tools = tools;
                                cx.notify();
                            }))
                    })),
            )
            .when(self.show_tools, |this| {
                this.child(self.destinations(colors, cx))
            })
            .when(!self.show_tools, |this| {
                this.child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(5.))
                        .px(px(10.))
                        .py(px(8.))
                        .child(
                            div()
                                .text_xs()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(colors.muted)
                                .child("Recent chats"),
                        )
                        .child(
                            Button::new("new-chat")
                                .ghost()
                                .small()
                                .icon(IconName::Plus)
                                .label("New chat")
                                .on_click(cx.listener(|this, _, window, cx| {
                                    this.start_conversation(window, cx)
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
                        .gap(px(2.))
                        .px(px(8.))
                        .when(!self.ready(), |this| {
                            this.child(
                                div()
                                    .text_sm()
                                    .text_color(colors.muted)
                                    .p(px(7.))
                                    .child("Open a workspace to see its chats."),
                            )
                        })
                        .when(self.ready(), |this| {
                            this.children(locals.into_iter().map(|(id, entry)| {
                                session_button(
                                    id,
                                    entry.title.as_deref(),
                                    self.editor_file_name(id),
                                    id == &self.selected,
                                    colors,
                                    cx,
                                )
                            }))
                            .children(self.sessions.iter().map(|session| {
                                session_button(
                                    &session.session_id,
                                    self.session_title(session),
                                    None,
                                    session.session_id == self.selected,
                                    colors,
                                    cx,
                                )
                            }))
                        })
                        .when(self.sessions_loading && self.sessions.is_empty(), |this| {
                            this.child(
                                div()
                                    .text_xs()
                                    .text_color(colors.muted)
                                    .p(px(7.))
                                    .child("Loading conversations…"),
                            )
                        }),
                )
                .when_some(self.session_error.as_ref(), |this, message| {
                    this.child(
                        notice(message.clone(), colors.danger, colors)
                            .mx(px(8.))
                            .my(px(6.))
                            .child(
                                Button::new("retry-chats")
                                    .ghost()
                                    .small()
                                    .label("Retry")
                                    .on_click(
                                        cx.listener(|this, _, _, cx| this.refresh_sessions(cx)),
                                    ),
                            ),
                    )
                })
                .when(self.ready(), |this| {
                    this.child(session_transfer::controls(self, colors, cx))
                })
            })
    }

    fn destinations(&self, colors: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("tools-destinations")
            .flex()
            .flex_col()
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .gap(px(3.))
            .p(px(8.))
            .children(
                DESTINATIONS
                    .iter()
                    .filter(|(_, view)| !matches!(view, View::Agent))
                    .map(|&(label, view)| {
                        let selected = self.view == view
                            || matches!(
                                (view, self.view),
                                (View::Connections(_), View::Connections(_))
                            );
                        mode_button(label, label, selected, colors)
                            .justify_start()
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.set_view(view, window, cx)
                            }))
                    }),
            )
    }

    fn chat(&self, colors: Palette, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        use gpui_component::IconName;

        let conversation = self.conversation();
        let active_run = conversation.active_run.as_ref();
        let can_send = self.ready()
            && active_run.is_none()
            && !self.composer.read(cx).value().trim().is_empty()
            && !conversation.loading_history
            && !conversation.choosing_attachments;
        let auxiliary = self.is_auxiliary_pane();
        let split = auxiliary || self.pane_layout.open_count() > 1;
        let gutter = if split || self.content_width(window, cx) < px(680.) {
            px(16.)
        } else {
            px(32.)
        };
        let shortcut = if cfg!(target_os = "macos") {
            "⌘ Return"
        } else {
            "Ctrl+Enter"
        };
        let title = conversation.title.as_deref().unwrap_or("New chat");
        let assistant = self.assistant_name();
        let key = format!("{}:{}", self.pane_id, self.selected);
        let away_from_latest = self.transcript_scroll.max_offset().height
            + self.transcript_scroll.offset().y
            > px(96.);

        let header = div()
            .flex_none()
            .h(colors.control_height() + px(12.))
            .flex()
            .items_center()
            .px(px(12.))
            .gap(px(8.))
            .border_b_1()
            .border_color(colors.divider)
            .child(
                div()
                    .min_w_0()
                    .flex_1()
                    .truncate()
                    .text_size(colors.control_size())
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(if self.uses_named_agent() {
                        format!("{assistant} / {title}")
                    } else {
                        title.to_owned()
                    }),
            )
            .child(
                div()
                    .flex()
                    .flex_none()
                    .items_center()
                    .gap(px(2.))
                    .when(auxiliary, |actions| {
                        actions.child(
                            Button::new("switch-pane-chat")
                                .small()
                                .ghost()
                                .icon(IconName::BookOpen)
                                .tooltip("Find conversations")
                                .on_click(cx.listener(|this, _, window, cx| {
                                    this.open_navigation(window, cx)
                                })),
                        )
                    })
                    .when(split, |actions| {
                        actions.child(
                            Button::new("next-conversation-pane")
                                .small()
                                .ghost()
                                .icon(IconName::GalleryVerticalEnd)
                                .tooltip("Focus next pane")
                                .on_click(
                                    cx.listener(|this, _, window, cx| this.next_pane(window, cx)),
                                ),
                        )
                    })
                    .when(self.ready(), |actions| {
                        actions
                            .child(
                                Button::new("split-pane-right")
                                    .small()
                                    .ghost()
                                    .icon(IconName::PanelRight)
                                    .tooltip("Split chat to the right")
                                    .on_click(cx.listener(|this, _, window, cx| {
                                        this.split_pane(SplitDirection::Right, window, cx)
                                    })),
                            )
                            .child(
                                Button::new("split-pane-down")
                                    .small()
                                    .ghost()
                                    .icon(IconName::PanelBottom)
                                    .tooltip("Split chat below")
                                    .on_click(cx.listener(|this, _, window, cx| {
                                        this.split_pane(SplitDirection::Down, window, cx)
                                    })),
                            )
                    })
                    .when(!auxiliary && self.pane_layout.can_reopen(), |actions| {
                        actions.child(
                            Button::new("reopen-conversation-pane")
                                .small()
                                .ghost()
                                .icon(IconName::WindowRestore)
                                .tooltip("Reopen last closed pane")
                                .on_click(
                                    cx.listener(|this, _, window, cx| this.reopen_pane(window, cx)),
                                ),
                        )
                    })
                    .when(auxiliary, |actions| {
                        actions.child(
                            Button::new("close-conversation-pane")
                                .small()
                                .ghost()
                                .icon(IconName::Close)
                                .tooltip("Close this pane")
                                .on_click(
                                    cx.listener(|this, _, window, cx| this.close_pane(window, cx)),
                                ),
                        )
                    }),
            );

        let history = if conversation.loading_history {
            Some(
                div()
                    .flex()
                    .justify_center()
                    .text_size(colors.metadata_size())
                    .text_color(colors.muted)
                    .child(if conversation.messages.is_empty() {
                        "Loading conversation…"
                    } else {
                        "Loading earlier messages…"
                    })
                    .into_any_element(),
            )
        } else if let Some(error) = &conversation.history_error {
            Some(
                notice(error.clone(), colors.danger, colors)
                    .child(
                        Button::new("retry-conversation-history")
                            .small()
                            .outline()
                            .label("Retry history")
                            .disabled(active_run.is_some())
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.load_history(this.conversation().has_earlier, cx)
                            })),
                    )
                    .into_any_element(),
            )
        } else if conversation.has_earlier {
            Some(
                div()
                    .flex()
                    .justify_center()
                    .child(
                        Button::new("earlier-messages")
                            .small()
                            .ghost()
                            .label("Load earlier messages")
                            .disabled(active_run.is_some())
                            .on_click(cx.listener(|this, _, _, cx| this.load_history(true, cx))),
                    )
                    .into_any_element(),
            )
        } else {
            None
        };
        let show_welcome = conversation.messages.is_empty()
            && active_run.is_none()
            && !conversation.loading_history
            && conversation.history_error.is_none()
            && conversation.error.is_none();
        let mut stack = div()
            .flex()
            .flex_col()
            .min_w_0()
            .min_h_full()
            .mx_auto()
            .max_w(colors.reading_width())
            .w_full()
            .px(gutter)
            .py(px(24.))
            .gap(px(22.))
            .children(history)
            .when(show_welcome, |stack| {
                stack.justify_center().child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(8.))
                        .child(
                            div()
                                .font_family(colors.display_family())
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_size(px(if split { 24. } else { 32. }))
                                .line_height(px(if split { 30. } else { 38. }))
                                .child(if self.uses_named_agent() {
                                    format!("Chat with {assistant}")
                                } else {
                                    "What are we working on?".into()
                                }),
                        )
                        .child(
                            div()
                                .text_size(colors.control_size())
                                .text_color(colors.muted)
                                .child("Ask a question or describe what you want to change."),
                        ),
                )
            });
        for (index, message) in conversation.messages.iter().enumerate() {
            let contents = chat_message_contents(
                &format!("{key}:message:{index}"),
                &message.text,
                &message.attachments,
                &message.wallet_activities,
                colors,
                window,
                cx,
            );
            stack = stack.child(message_row(&message.role, assistant, contents, colors));
        }
        if let Some(run) = active_run {
            let prompt = chat_message_contents(
                &format!("{key}:request:{}", run.id),
                &crate::markdown_text::for_transcript(&run.prompt),
                &run.attachments,
                &[],
                colors,
                window,
                cx,
            );
            let reply = chat_message_contents(
                &format!("{key}:reply:{}", run.id),
                &crate::markdown_text::for_transcript(&run.reply),
                &[],
                &run.wallet_activities,
                colors,
                window,
                cx,
            );
            stack = stack
                .child(message_row("user", assistant, prompt, colors))
                .child(message_row(
                    "assistant",
                    assistant,
                    reply.child(
                        div()
                            .text_size(colors.metadata_size())
                            .text_color(if run.interrupted {
                                colors.warning
                            } else {
                                colors.muted
                            })
                            .child(if run.cancelling {
                                "Requesting stop…".into()
                            } else {
                                run.status.clone()
                            }),
                    ),
                    colors,
                ));
        }

        let transcript = div()
            .id("transcript")
            .flex_1()
            .min_h_0()
            .min_w_0()
            .overflow_y_scroll()
            .track_scroll(&self.transcript_scroll)
            .on_scroll_wheel(cx.listener(|_, _, _, cx| cx.notify()))
            .child(stack);
        let thread = div()
            .relative()
            .flex()
            .flex_col()
            .flex_1()
            .min_h_0()
            .child(transcript)
            .when(away_from_latest, |thread| {
                thread.child(
                    div()
                        .absolute()
                        .bottom(px(8.))
                        .left_0()
                        .right_0()
                        .flex()
                        .justify_end()
                        .mx_auto()
                        .max_w(colors.reading_width())
                        .px(gutter)
                        .child(
                            Button::new("jump-to-latest")
                                .small()
                                .outline()
                                .bg(colors.raised)
                                .icon(IconName::ArrowDown)
                                .label("Latest")
                                .tooltip("Jump to latest message")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.transcript_scroll.scroll_to_bottom();
                                    cx.notify();
                                })),
                        ),
                )
            });

        let composer = colors
            .surface(div(), Surface::Composer)
            .id("chat-composer")
            .key_context("DoolittleComposer")
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(5.))
            .border_1()
            .border_color(colors.divider)
            .px(px(8.))
            .pt(px(8.))
            .pb(px(6.))
            .when(!conversation.draft_attachments.is_empty(), |composer| {
                composer.child(
                    div()
                        .id("draft-attachments")
                        .max_h(px(76.))
                        .overflow_y_scroll()
                        .child(div().flex().flex_wrap().gap(px(4.)).children(
                            conversation.draft_attachments.iter().map(|file| {
                                let id = file.id.clone();
                                div()
                                    .flex()
                                    .min_w_0()
                                    .items_center()
                                    .gap(px(4.))
                                    .pl(px(8.))
                                    .rounded(colors.control_radius())
                                    .bg(colors.inset)
                                    .child(
                                        div()
                                            .max_w(px(140.))
                                            .truncate()
                                            .text_size(colors.metadata_size())
                                            .child(file.name.clone()),
                                    )
                                    .child(
                                        Button::new(SharedString::from(format!(
                                            "remove-attachment:{id}"
                                        )))
                                        .small()
                                        .ghost()
                                        .icon(IconName::Close)
                                        .tooltip(format!("Remove {}", file.name))
                                        .on_click(
                                            cx.listener(move |this, _, _, cx| {
                                                this.remove_draft_attachment(&id, cx)
                                            }),
                                        ),
                                    )
                            }),
                        )),
                )
            })
            .child(
                Input::new(&self.composer)
                    .appearance(false)
                    .focus_bordered(false)
                    .w_full(),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .when(!self.uses_named_agent(), |row| {
                        row.child(
                            Button::new("attach-files")
                                .small()
                                .ghost()
                                .icon(IconName::Plus)
                                .tooltip("Attach files")
                                .disabled(
                                    active_run.is_some()
                                        || !self.ready()
                                        || conversation.choosing_attachments
                                        || conversation.draft_attachments.len() >= 8,
                                )
                                .on_click(
                                    cx.listener(|this, _, _, cx| this.choose_attachments(cx)),
                                ),
                        )
                        .child(
                            Button::new("chat-model-settings")
                                .small()
                                .ghost()
                                .label(if self.uses_named_agent() {
                                    "Agent access".into()
                                } else {
                                    self.control_value(connections::SETTINGS)
                                        .and_then(|settings| {
                                            settings.pointer("/settings/model/model")
                                        })
                                        .and_then(|model| model.as_str())
                                        .filter(|model| !model.trim().is_empty())
                                        .map(|model| model.chars().take(24).collect())
                                        .unwrap_or_else(|| "Model".to_owned())
                                })
                                .tooltip(if self.uses_named_agent() {
                                    "Manage this agent’s model access"
                                } else {
                                    "Choose a model in settings"
                                })
                                .on_click(cx.listener(|this, _, window, cx| {
                                    let view = if this.uses_named_agent() {
                                        View::Operations(operations::OpsPage::Agents)
                                    } else {
                                        View::Connections(ConnectionsPage::Models)
                                    };
                                    this.set_view(view, window, cx);
                                })),
                        )
                    })
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .text_right()
                            .text_size(colors.metadata_size())
                            .text_color(colors.muted)
                            .child(if conversation.choosing_attachments {
                                "Attaching files…"
                            } else if active_run.is_none() && !split {
                                shortcut
                            } else {
                                ""
                            }),
                    )
                    .when_some(active_run, |this, run| {
                        this.when(run.interrupted, |actions| {
                            actions.child(
                                Button::new("resume-run")
                                    .small()
                                    .outline()
                                    .label("Check run")
                                    .on_click(cx.listener(|this, _, _, cx| this.resume_run(cx))),
                            )
                        })
                        .when(run.started, |actions| {
                            actions.child(
                                Button::new("stop-run")
                                    .small()
                                    .outline()
                                    .label(if run.cancelling {
                                        "Stopping…"
                                    } else {
                                        "Stop"
                                    })
                                    .disabled(run.cancelling)
                                    .on_click(cx.listener(|this, _, _, cx| this.cancel_run(cx))),
                            )
                        })
                    })
                    .when(active_run.is_none(), |this| {
                        this.child(
                            Button::new("send")
                                .small()
                                .primary()
                                .label("Send")
                                .tooltip(format!("Send message ({shortcut})"))
                                .disabled(!can_send)
                                .on_click(cx.listener(|this, _, window, cx| this.send(window, cx))),
                        )
                    }),
            );

        div()
            .id("agent-workbench")
            .flex()
            .flex_col()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .child(header)
            .child(thread)
            .child(
                div()
                    .flex()
                    .flex_col()
                    .flex_none()
                    .w_full()
                    .max_w(colors.reading_width())
                    .mx_auto()
                    .px(gutter)
                    .pb(px(14.))
                    .gap(px(7.))
                    .when_some(conversation.error.as_ref(), |dock, error| {
                        dock.child(notice(error.clone(), colors.danger, colors).when(
                            conversation.recover_prompt.is_some(),
                            |notice| {
                                notice.child(
                                    Button::new("restore-prompt")
                                        .small()
                                        .outline()
                                        .label("Restore prompt")
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.restore_prompt(window, cx)
                                        })),
                                )
                            },
                        ))
                    })
                    .child(composer),
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
        let compact = workspace_tools::compact_ide(self.content_width(window, cx));
        let explorer = self.explorer_open && self.ready();
        let editor = self
            .ide_editor(colors, dirty, explorer, cx)
            .into_any_element();
        let files = explorer.then(|| self.ide_explorer(colors, compact, cx).into_any_element());
        let content = workspace_tools::layout(self, colors, editor, files, window, cx);

        div()
            .id("ide-workbench")
            .flex()
            .flex_col()
            .size_full()
            .min_w_0()
            .min_h_0()
            .overflow_hidden()
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .flex_none()
                    .items_center()
                    .min_h(px(42.))
                    .gap(px(4.))
                    .px(px(8.))
                    .py(px(3.))
                    .bg(colors.rail)
                    .border_b_1()
                    .border_color(colors.divider)
                    .child(
                        Button::new("explorer-toggle")
                            .small()
                            .ghost()
                            .label("Files")
                            .tooltip(if explorer {
                                "Hide Explorer"
                            } else {
                                "Show Explorer"
                            })
                            .selected(explorer)
                            .when(explorer, |button| {
                                button.bg(colors.raised).text_color(colors.text)
                            })
                            .disabled(!self.ready())
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.explorer_open = !this.explorer_open;
                                cx.notify();
                            })),
                    )
                    .child(div().w(px(1.)).h(px(16.)).mx(px(3.)).bg(colors.divider))
                    .child(workspace_tools::toolbar(self, colors, cx))
                    .when(!compact, |toolbar| {
                        toolbar.child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .truncate()
                                .text_right()
                                .text_xs()
                                .text_color(colors.muted)
                                .pr(px(4.))
                                .child(self.workspace_title()),
                        )
                    }),
            )
            .child(
                div()
                    .flex()
                    .flex_1()
                    .min_w_0()
                    .min_h_0()
                    .overflow_hidden()
                    .child(content),
            )
            .into_any_element()
    }

    fn ide_explorer(&self, colors: Palette, compact: bool, cx: &mut Context<Self>) -> gpui::Div {
        let current = self.workspace.file.as_ref().map(|file| file.path.as_str());
        let reading_file = self.workspace.loading_file.is_some();
        let visible = self.workspace.entries.iter().filter(|entry| {
            !self.workspace.collapsed.iter().any(|folder| {
                entry
                    .path
                    .strip_prefix(folder)
                    .is_some_and(|rest| rest.starts_with('/'))
            })
        });

        div()
            .size_full()
            .flex()
            .flex_col()
            .min_w_0()
            .min_h_0()
            .overflow_hidden()
            .bg(colors.rail)
            .child(
                div()
                    .flex()
                    .flex_none()
                    .items_center()
                    .gap(px(6.))
                    .h(px(36.))
                    .px(px(8.))
                    .border_b_1()
                    .border_color(colors.divider)
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .text_sm()
                            .font_weight(FontWeight::MEDIUM)
                            .child("Explorer"),
                    )
                    .child(
                        Button::new("refresh-files")
                            .small()
                            .ghost()
                            .label("Refresh")
                            .loading(self.workspace.loading_tree)
                            .disabled(!self.ready() || self.workspace.loading_tree)
                            .on_click(cx.listener(|this, _, _, cx| this.refresh_workspace(cx))),
                    ),
            )
            .when_some(self.workspace.error.as_ref(), |rail, error| {
                rail.child(
                    div()
                        .px(px(10.))
                        .py(px(8.))
                        .text_sm()
                        .text_color(colors.danger)
                        .child(error.clone()),
                )
            })
            .child(
                div()
                    .id("file-explorer")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .py(px(4.))
                    .children(visible.map(|entry| {
                        let path = entry.path.clone();
                        let leaf = path.rsplit('/').next().unwrap_or(&path).to_owned();
                        let folder = entry.kind == "directory";
                        let collapsed = self.workspace.collapsed.contains(&path);
                        let selected = current == Some(path.as_str());
                        let marker = if !folder {
                            ""
                        } else if collapsed {
                            "›"
                        } else {
                            "▾"
                        };
                        div()
                            .pl(px(4. + f32::from(entry.depth.min(8)) * 10.))
                            .pr(px(4.))
                            .child(
                                Button::new(SharedString::from(format!("ide-file-{path}")))
                                    .small()
                                    .ghost()
                                    .w_full()
                                    .justify_start()
                                    .tooltip(path.clone())
                                    .selected(selected)
                                    .when(selected, |button| {
                                        button.bg(colors.raised).text_color(colors.text)
                                    })
                                    .disabled(reading_file && !folder)
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .gap(px(4.))
                                            .min_w_0()
                                            .child(
                                                div()
                                                    .flex_none()
                                                    .w(px(10.))
                                                    .text_color(colors.muted)
                                                    .child(marker),
                                            )
                                            .child(div().min_w_0().truncate().child(leaf)),
                                    )
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        if folder {
                                            if !this.workspace.collapsed.remove(&path) {
                                                this.workspace.collapsed.insert(path.clone());
                                            }
                                            cx.notify();
                                        } else {
                                            this.open_file(path.clone(), compact, window, cx);
                                        }
                                    })),
                            )
                    }))
                    .when(
                        self.workspace.entries.is_empty() && self.workspace.error.is_none(),
                        |list| {
                            let label = if self.workspace.loading_tree {
                                "Reading workspace files…"
                            } else if self.ready() {
                                "No files found."
                            } else if self.connecting {
                                "Starting the workspace…"
                            } else {
                                "Start the runtime to browse files."
                            };
                            list.child(
                                div()
                                    .p(px(10.))
                                    .text_sm()
                                    .text_color(colors.muted)
                                    .child(label),
                            )
                        },
                    ),
            )
            .when(self.workspace.truncated, |rail| {
                rail.child(
                    div()
                        .px(px(10.))
                        .py(px(7.))
                        .border_t_1()
                        .border_color(colors.divider)
                        .text_xs()
                        .text_color(colors.muted)
                        .child("Tree limit reached. Use Search to find more files."),
                )
            })
    }

    fn ide_editor(
        &self,
        colors: Palette,
        dirty: bool,
        explorer: bool,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let file = self.workspace.file.as_ref();
        let reading_file = self.workspace.loading_file.as_deref();
        div()
            .size_full()
            .flex()
            .flex_col()
            .min_w_0()
            .min_h_0()
            .overflow_hidden()
            .bg(colors.editor)
            .when_some(file, |editor, file| {
                let (parent, name) = file
                    .path
                    .rsplit_once('/')
                    .unwrap_or(("", file.path.as_str()));
                let status = if reading_file.is_some() {
                    Some("Opening…")
                } else if file.saving {
                    Some("Saving…")
                } else if file.stale {
                    Some("Changed on disk")
                } else if dirty {
                    Some("Unsaved")
                } else {
                    None
                };
                editor.child(
                    div()
                        .flex()
                        .flex_none()
                        .items_center()
                        .gap(px(7.))
                        .min_h(px(36.))
                        .px(px(10.))
                        .bg(colors.rail)
                        .border_b_1()
                        .border_color(colors.divider)
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(4.))
                                .flex_1()
                                .min_w_0()
                                .text_sm()
                                .when(!parent.is_empty(), |path| {
                                    path.child(
                                        div()
                                            .min_w_0()
                                            .max_w(gpui::relative(0.58))
                                            .truncate()
                                            .text_color(colors.muted)
                                            .child(format!("{parent} /")),
                                    )
                                })
                                .child(div().min_w_0().truncate().child(name.to_owned())),
                        )
                        .when_some(status, |header, status| {
                            header.child(
                                div()
                                    .flex_none()
                                    .text_xs()
                                    .text_color(if file.stale {
                                        colors.danger
                                    } else {
                                        colors.muted
                                    })
                                    .child(status),
                            )
                        })
                        .child(
                            Button::new("reload-file")
                                .small()
                                .ghost()
                                .label("Reload")
                                .disabled(reading_file.is_some() || file.saving)
                                .on_click(
                                    cx.listener(|this, _, window, cx| this.reload_file(window, cx)),
                                ),
                        )
                        .child(
                            Button::new("save-file")
                                .small()
                                .outline()
                                .label("Save")
                                .disabled(
                                    reading_file.is_some() || !dirty || file.saving || file.stale,
                                )
                                .on_click(cx.listener(|this, _, _, cx| this.save_file(cx))),
                        ),
                )
            })
            .when_some(self.workspace.file_error.as_ref(), |editor, error| {
                editor.child(
                    div()
                        .flex_none()
                        .px(px(10.))
                        .py(px(8.))
                        .border_b_1()
                        .border_color(colors.divider)
                        .text_sm()
                        .text_color(colors.danger)
                        .child(error.clone()),
                )
            })
            .child(
                div()
                    .id("file-document")
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_h_0()
                    .min_w_0()
                    .overflow_hidden()
                    .when_some(file, |document, file| {
                        document.child(
                            Input::new(&file.editor)
                                .w_full()
                                .h_full()
                                .appearance(false)
                                .focus_bordered(false)
                                .disabled(reading_file.is_some()),
                        )
                    })
                    .when(file.is_none(), |document| {
                        let label = if self.needs_workspace() {
                            "Open a workspace"
                        } else if reading_file.is_some() {
                            "Opening file…"
                        } else if self.connecting {
                            "Starting the workspace…"
                        } else if self.ready() {
                            "Open a file from Explorer"
                        } else {
                            "Workspace runtime unavailable"
                        };
                        document.child(
                            div()
                                .flex_1()
                                .flex()
                                .flex_col()
                                .justify_center()
                                .items_center()
                                .gap(px(10.))
                                .p(px(16.))
                                .text_center()
                                .text_sm()
                                .text_color(colors.muted)
                                .child(label)
                                .when(self.needs_workspace(), |empty| {
                                    empty.child(
                                        Button::new("ide-open-folder")
                                            .small()
                                            .outline()
                                            .label("Open folder…")
                                            .disabled(self.choosing_workspace)
                                            .on_click(cx.listener(|this, _, window, cx| {
                                                this.choose_workspace(window, cx)
                                            })),
                                    )
                                })
                                .when(
                                    self.ready() && !explorer && reading_file.is_none(),
                                    |empty| {
                                        empty.child(
                                            Button::new("ide-open-explorer")
                                                .small()
                                                .outline()
                                                .label("Show Explorer")
                                                .on_click(cx.listener(|this, _, _, cx| {
                                                    this.explorer_open = true;
                                                    cx.notify();
                                                })),
                                        )
                                    },
                                )
                                .when(
                                    !self.needs_workspace() && !self.connecting && !self.ready(),
                                    |empty| {
                                        empty
                                            .when_some(self.error.as_ref(), |empty, error| {
                                                empty.child(
                                                    div()
                                                        .text_xs()
                                                        .text_color(colors.danger)
                                                        .child(error.clone()),
                                                )
                                            })
                                            .child(
                                                Button::new("retry-ide-runtime")
                                                    .small()
                                                    .outline()
                                                    .label("Start runtime")
                                                    .on_click(cx.listener(
                                                        |this, _, window, cx| {
                                                            this.connect(window, cx)
                                                        },
                                                    )),
                                            )
                                    },
                                ),
                        )
                    }),
            )
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
    file: Option<&str>,
    selected: bool,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> Button {
    let title = title.filter(|title| !title.trim().is_empty());
    let button_label = title
        .or(file)
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

fn chat_message_contents(
    id: &str,
    source: &str,
    attachments: &[doolittle_runtime::MessageAttachment],
    wallet_activities: &[serde_json::Value],
    colors: Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> gpui::Div {
    use gpui_component::{IconName, Theme, text::TextViewStyle};

    let mut code_surface = div()
        .min_w_0()
        .pt(px(36.))
        .border_1()
        .border_color(colors.divider)
        .bg(colors.editor)
        .text_color(colors.editor_text);
    let theme = Theme::global(cx);
    let style = TextViewStyle {
        is_dark: theme.is_dark(),
        highlight_theme: theme.highlight_theme.clone(),
        ..TextViewStyle::default()
    }
    .paragraph_gap(gpui::rems(0.65))
    .heading_font_size(|level, _| match level {
        1 => px(22.),
        2 => px(18.),
        _ => px(15.),
    })
    .code_block(code_surface.style().clone());

    div()
        .flex()
        .flex_col()
        .min_w_0()
        .gap(px(8.))
        .text_size(colors.conversation_size())
        .line_height(colors.line_height())
        .when(!source.is_empty(), |content| {
            content.child(
                TextView::markdown(
                    SharedString::from(id.to_owned()),
                    SharedString::from(source.to_owned()),
                    window,
                    cx,
                )
                .style(style)
                .selectable(true)
                .min_w_0()
                .w_full()
                .code_block_actions(move |block, _, _| {
                    let code = block.code();
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .when_some(block.lang(), |toolbar, language| {
                            toolbar.child(
                                div()
                                    .max_w(px(75.))
                                    .truncate()
                                    .text_size(colors.metadata_size())
                                    .text_color(colors.muted)
                                    .child(language),
                            )
                        })
                        .child(
                            Button::new("copy-code")
                                .small()
                                .ghost()
                                .icon(IconName::Copy)
                                .label("Copy")
                                .tooltip("Copy code")
                                .on_click(move |_, _, cx| {
                                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(
                                        code.to_string(),
                                    ));
                                }),
                        )
                }),
            )
        })
        .children(attachments.iter().map(|file| {
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .text_size(colors.metadata_size())
                .text_color(colors.muted)
                .child(div().min_w_0().truncate().child(file.name.clone()))
                .child(format!("{} KB", file.size_bytes.div_ceil(1024)))
        }))
        .children(
            wallet_activities
                .iter()
                .enumerate()
                .filter_map(|(index, receipt)| {
                    connections::wallet::render(
                        receipt,
                        format!("{id}:wallet:{index}"),
                        &colors,
                        cx,
                    )
                }),
        )
}

fn message_row(
    role: &str,
    assistant: &str,
    content: impl IntoElement,
    colors: Palette,
) -> impl IntoElement {
    let title = match role {
        "user" => "You",
        "assistant" => assistant,
        "tool" => "Tool",
        _ => "System",
    };
    let user = role == "user";
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .when(user, |row| row.items_end())
        .gap(px(7.))
        .text_color(colors.text)
        .child(
            div()
                .text_size(colors.metadata_size())
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(colors.muted)
                .child(title.to_owned()),
        )
        .child(
            div()
                .min_w_0()
                .when(user, |this| {
                    colors
                        .surface(this.max_w(gpui::relative(0.88)), Surface::Message)
                        .px(px(14.))
                        .py(px(10.))
                })
                .when(!user, |this| this.w_full())
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
