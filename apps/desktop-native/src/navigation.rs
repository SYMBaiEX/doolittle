use std::{cell::Cell, rc::Rc};

use gpui::{
    App, AppContext, Context, KeyBinding, ScrollHandle, SharedString, Window, actions, div,
    prelude::*, px,
};
use gpui_component::{
    Selectable, Sizable, WindowExt,
    button::{Button, ButtonVariants},
    input::{Input, InputEvent, InputState},
};

use crate::{
    connections::ConnectionsPage,
    operations::OpsPage,
    themes::Palette,
    workbench::{View, Workbench},
};

actions!(doolittle, [NavigationNext, NavigationPrevious]);

pub(crate) const DESTINATIONS: &[(&str, View)] = &[
    ("Agent chat", View::Agent),
    ("Overview", View::Operations(OpsPage::Home)),
    ("Work", View::Operations(OpsPage::Work)),
    ("Review", View::Operations(OpsPage::Review)),
    ("Agents", View::Operations(OpsPage::Agents)),
    ("Automations", View::Operations(OpsPage::Automations)),
    ("Inbox", View::Operations(OpsPage::Inbox)),
    ("Activity", View::Operations(OpsPage::Activity)),
    ("Insights", View::Operations(OpsPage::Insights)),
    ("Assets", View::Operations(OpsPage::Media)),
    ("Settings", View::Connections(ConnectionsPage::Appearance)),
];

const SHORTCUTS: &[(&str, View)] = &[
    ("IDE", View::Ide),
    ("Model settings", View::Connections(ConnectionsPage::Models)),
    (
        "Provider accounts",
        View::Connections(ConnectionsPage::Accounts),
    ),
    (
        "Credentials",
        View::Connections(ConnectionsPage::Credentials),
    ),
    ("Setup", View::Connections(ConnectionsPage::Setup)),
];

#[derive(Clone)]
enum Target {
    Page(View),
    Chat { id: String, title: Option<String> },
}

#[derive(Clone)]
struct Match {
    label: SharedString,
    target: Target,
}

impl Match {
    fn open(&self, workbench: &mut Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
        match &self.target {
            Target::Page(view) => workbench.set_view(*view, window, cx),
            Target::Chat { id, title } => {
                workbench.select_conversation(id.clone(), title.clone(), window, cx)
            }
        }
    }
}

pub(crate) fn bind_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new("down", NavigationNext, Some("DoolittleNavigation > Input")),
        KeyBinding::new(
            "up",
            NavigationPrevious,
            Some("DoolittleNavigation > Input"),
        ),
    ]);
}

fn rank(label: &str, query: &str) -> Option<u8> {
    let label = label.to_lowercase();
    if label == query {
        Some(0)
    } else if label.starts_with(query) {
        Some(1)
    } else if query.split_whitespace().all(|term| label.contains(term)) {
        Some(2)
    } else {
        None
    }
}

fn catalog(workbench: &Workbench) -> Vec<Match> {
    let mut choices: Vec<_> = DESTINATIONS
        .iter()
        .chain(SHORTCUTS)
        .map(|&(label, view)| Match {
            label: label.into(),
            target: Target::Page(view),
        })
        .collect();
    choices.extend(workbench.sessions.iter().filter_map(|session| {
        let title = workbench.session_title(session)?.to_owned();
        Some(Match {
            label: title.clone().into(),
            target: Target::Chat {
                id: session.session_id.clone(),
                title: Some(title.clone()),
            },
        })
    }));
    choices.extend(workbench.active.iter().filter_map(|(id, chat)| {
        if workbench
            .sessions
            .iter()
            .any(|session| session.session_id == *id)
        {
            return None;
        }
        let label = chat
            .title
            .as_deref()
            .or_else(|| workbench.editor_file_name(id))?;
        Some(Match {
            label: label.to_owned().into(),
            target: Target::Chat {
                id: id.clone(),
                title: chat.title.clone(),
            },
        })
    }));
    choices
}

fn matches<'a>(catalog: &'a [Match], query: &str) -> Vec<&'a Match> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return catalog.iter().take(20).collect();
    }
    let mut found = catalog
        .iter()
        .filter_map(|choice| rank(&choice.label, &query).map(|rank| (rank, choice)))
        .collect::<Vec<_>>();
    found.sort_by_key(|(rank, _)| *rank);
    found
        .into_iter()
        .take(24)
        .map(|(_, result)| result)
        .collect()
}

fn move_selection(
    selection: &Cell<usize>,
    count: usize,
    offset: isize,
    scroll: &ScrollHandle,
    window: &mut Window,
) {
    if count == 0 {
        return;
    }
    let index = selection.get().saturating_add_signed(offset).min(count - 1);
    selection.set(index);
    scroll.scroll_to_item(index);
    window.refresh();
}

impl Workbench {
    pub(crate) fn open_navigation(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if window.has_active_dialog(cx) {
            return;
        }
        let input =
            cx.new(|cx| InputState::new(window, cx).placeholder("Find a page or conversation"));
        let selection = Rc::new(Cell::new(0));
        let scroll = ScrollHandle::new();
        // The dialog layer renders while Workbench is already leased by GPUI.
        let catalog = Rc::new(catalog(self));
        self.navigation_updates = Some(cx.subscribe_in(&input, window, {
            let selection = selection.clone();
            let scroll = scroll.clone();
            let catalog = catalog.clone();
            move |this, content, event, window, cx| match event {
                InputEvent::Change => {
                    selection.set(0);
                    scroll.scroll_to_item(0);
                    window.refresh();
                }
                InputEvent::PressEnter { .. } => {
                    let query = content.read(cx).value();
                    if let Some(choice) = matches(&catalog, &query).get(selection.get()) {
                        window.close_dialog(cx);
                        choice.open(this, window, cx);
                    }
                }
                _ => {}
            }
        }));
        let workbench = cx.entity().downgrade();
        let content = input.clone();
        window.open_dialog(cx, move |dialog, _window, cx| {
            let colors = Palette::current(cx);
            let found = matches(&catalog, &content.read(cx).value());
            let count = found.len();
            let selected = selection.get();
            dialog.title("Go to").child(
                div()
                    .id("doolittle-navigation")
                    .key_context("DoolittleNavigation")
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .on_action({
                        let (selection, scroll) = (selection.clone(), scroll.clone());
                        move |_: &NavigationNext, window, cx| {
                            cx.stop_propagation();
                            move_selection(&selection, count, 1, &scroll, window);
                        }
                    })
                    .on_action({
                        let (selection, scroll) = (selection.clone(), scroll.clone());
                        move |_: &NavigationPrevious, window, cx| {
                            cx.stop_propagation();
                            move_selection(&selection, count, -1, &scroll, window);
                        }
                    })
                    .child(Input::new(&content).focus_bordered(false))
                    .child(
                        div()
                            .id("navigation-matches")
                            .flex()
                            .flex_col()
                            .gap(px(3.))
                            .max_h(px(310.))
                            .overflow_y_scroll()
                            .track_scroll(&scroll)
                            .when(count == 0, |this| {
                                this.child(
                                    div()
                                        .text_color(colors.muted)
                                        .text_sm()
                                        .p(px(8.))
                                        .child("No matching pages or conversations."),
                                )
                            })
                            .children(found.into_iter().cloned().enumerate().map(
                                |(index, choice)| {
                                    let workbench = workbench.clone();
                                    Button::new(("navigation-choice", index))
                                        .small()
                                        .ghost()
                                        .selected(index == selected)
                                        .when(index == selected, |button| {
                                            button.bg(colors.raised).text_color(colors.text)
                                        })
                                        .label(choice.label.clone())
                                        .justify_start()
                                        .w_full()
                                        .on_click(move |_, window, cx| {
                                            window.close_dialog(cx);
                                            let _ = workbench.update(cx, |this, cx| {
                                                choice.open(this, window, cx)
                                            });
                                        })
                                },
                            )),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(colors.muted)
                            .child("↑ ↓ Select    Enter Open    Esc Close"),
                    ),
            )
        });
        input.update(cx, |input, cx| input.focus(window, cx));
    }
}

#[cfg(test)]
#[path = "../../../tests/native/navigation.rs"]
mod tests;
