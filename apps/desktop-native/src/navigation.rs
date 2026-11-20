use gpui::{AppContext, Context, SharedString, Window, div, prelude::*, px};
use gpui_component::{
    Sizable, WindowExt,
    button::{Button, ButtonVariants},
    input::{Input, InputState},
};

use crate::{
    connections::ConnectionsPage,
    operations::OpsPage,
    workbench::{View, Workbench},
};

pub(crate) const DESTINATIONS: &[(&str, View)] = &[
    ("Home", View::Operations(OpsPage::Home)),
    ("Workspace", View::Agent),
    ("Work", View::Operations(OpsPage::Work)),
    ("Activity", View::Operations(OpsPage::Activity)),
    ("Insights", View::Operations(OpsPage::Insights)),
    ("Agents", View::Operations(OpsPage::Agents)),
    ("Review", View::Operations(OpsPage::Review)),
    ("Automations", View::Operations(OpsPage::Automations)),
    ("Inbox", View::Operations(OpsPage::Inbox)),
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
];

impl Workbench {
    pub(crate) fn open_navigation(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if window.has_active_dialog(cx) {
            return;
        }
        let input = cx.new(|cx| InputState::new(window, cx).placeholder("Find a destination"));
        self.navigation_updates = Some(cx.observe(&input, |_, _, cx| cx.notify()));
        let view = cx.entity().downgrade();
        let content = input.clone();
        window.open_dialog(cx, move |dialog, _window, cx| {
            let query = content.read(cx).value().trim().to_lowercase();
            let matches = DESTINATIONS
                .iter()
                .chain(SHORTCUTS)
                .filter(|(label, _)| label.to_lowercase().contains(&query));
            let sessions: Vec<_> = view
                .upgrade()
                .map(|entity| {
                    entity
                        .read(cx)
                        .sessions
                        .iter()
                        .filter_map(|session| {
                            let title =
                                session.title.as_ref().or_else(|| session.preview.first())?;
                            title
                                .to_lowercase()
                                .contains(&query)
                                .then(|| (session.session_id.clone(), title.clone()))
                        })
                        .take(if query.is_empty() { 5 } else { 12 })
                        .collect()
                })
                .unwrap_or_default();
            dialog
                .title("Go to…")
                .child(Input::new(&content).focus_bordered(false))
                .child(
                    div()
                        .id("navigation-matches")
                        .flex()
                        .flex_col()
                        .gap(px(3.))
                        .max_h(px(285.))
                        .overflow_y_scroll()
                        .children(matches.map(|&(label, target)| {
                            let view = view.clone();
                            Button::new(SharedString::from(format!("goto:{label}")))
                                .small()
                                .ghost()
                                .label(label)
                                .justify_start()
                                .w_full()
                                .on_click(move |_, window, cx| {
                                    window.close_dialog(cx);
                                    let _ = view
                                        .update(cx, |this, cx| this.set_view(target, window, cx));
                                })
                        }))
                        .when(!sessions.is_empty(), |panel| {
                            panel.child(div().text_xs().px(px(7.)).child("Conversations"))
                        })
                        .children(sessions.into_iter().map(|(id, title)| {
                            let view = view.clone();
                            Button::new(SharedString::from(format!("goto-session:{id}")))
                                .small()
                                .ghost()
                                .label(title.clone())
                                .justify_start()
                                .w_full()
                                .on_click(move |_, window, cx| {
                                    window.close_dialog(cx);
                                    let _ = view.update(cx, |this, cx| {
                                        this.select_conversation(
                                            id.clone(),
                                            Some(title.clone()),
                                            window,
                                            cx,
                                        )
                                    });
                                })
                        })),
                )
        });
        input.update(cx, |input, cx| input.focus(window, cx));
    }
}
