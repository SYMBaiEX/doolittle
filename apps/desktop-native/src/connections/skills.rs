use doolittle_runtime::ControlMethod;
use gpui::{
    Context, Div, Entity, PromptButton, PromptLevel, SharedString, Window, div, prelude::*, px,
};
use gpui_component::{
    Disableable, Sizable,
    button::{Button, ButtonVariants},
    input::{Input, InputState},
};
use serde_json::{Value, json};

use super::{
    ConnectionsPage, action_status, column, field, input_field, muted, notice, panel, read_status,
    row, text_at, value, values,
};
use crate::{ui::Palette, workbench::Workbench};

pub(super) const PROPOSALS: &str = "/skills/proposals";
const AFTER_DECISION: &[&str] = &[PROPOSALS, "/skills"];

#[derive(Default)]
pub(super) struct WorkshopState {
    content: Option<Entity<InputState>>,
    selection: Option<String>,
    state_filter: ProposalFilter,
    submitting_slug: Option<String>,
}

#[derive(Default, Clone, Copy, PartialEq, Eq)]
enum ProposalFilter {
    #[default]
    Pending,
    Approved,
    Rejected,
    All,
}

const FILTERS: [(ProposalFilter, &str, &str); 4] = [
    (ProposalFilter::Pending, "pending", "Pending"),
    (ProposalFilter::Approved, "approved", "Approved"),
    (ProposalFilter::Rejected, "rejected", "Rejected"),
    (ProposalFilter::All, "all", "All"),
];

pub(super) fn workshop(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    if workbench.connections.workshop.submitting_slug.is_some()
        && !workbench.control_action_pending(PROPOSALS)
    {
        let previous = workbench.connections.workshop.submitting_slug.take();
        if workbench.control_action_value(PROPOSALS).is_some() {
            if previous.as_deref() == Some(value(workbench, "skill-proposal-slug", cx).trim()) {
                workbench.connections.fields.remove("skill-proposal-slug");
                workbench.connections.workshop.content = None;
            }
            workbench.connections.workshop.state_filter = ProposalFilter::Pending;
        }
    }
    let ready = workbench.ready() && !workbench.control_action_pending(PROPOSALS);
    let slug = input_field(
        workbench,
        "skill-proposal-slug",
        "",
        "example-workflow",
        false,
        window,
        cx,
    );
    let filter = input_field(
        workbench,
        "skill-proposal-search",
        "",
        "Filter proposals",
        false,
        window,
        cx,
    );
    let query = value(workbench, "skill-proposal-search", cx)
        .trim()
        .to_lowercase();
    let content = workbench
        .connections
        .workshop
        .content
        .get_or_insert_with(|| {
            cx.new(|cx| {
                InputState::new(window, cx)
                    .multi_line(true)
                    .rows(6)
                    .placeholder("Add the SKILL.md body")
            })
        })
        .clone();
    let detail = review_detail(workbench, colors, window, cx);
    let selected = workbench.connections.workshop.selection.as_deref();
    let state_filter = workbench.connections.workshop.state_filter;
    let filtered = values(workbench.control_value(PROPOSALS), "proposals")
        .iter()
        .filter(|proposal| {
            let disposition = text_at(Some(proposal), "disposition")
                .or_else(|| text_at(Some(proposal), "status"))
                .unwrap_or("pending");
            let state_match = match state_filter {
                ProposalFilter::All => true,
                ProposalFilter::Pending => {
                    disposition == "pending" && safety(proposal) != Some("blocked")
                }
                ProposalFilter::Approved => disposition == "approved",
                ProposalFilter::Rejected => {
                    disposition == "rejected" || safety(proposal) == Some("blocked")
                }
            };
            state_match
                && (query.is_empty()
                    || ["slug", "title", "description", "author"]
                        .into_iter()
                        .filter_map(|key| text_at(Some(proposal), key))
                        .any(|text| text.to_lowercase().contains(&query)))
        })
        .collect::<Vec<_>>();
    panel(colors, "Skill workshop")
        .child(muted(
            colors,
            "Draft a SKILL.md and review the safety scan before activation.",
        ))
        .child(field("Skill name", &slug, colors, ready))
        .child(
            column(4.)
                .child(muted(colors, "SKILL.md"))
                .child(Input::new(&content).disabled(!ready).w_full()),
        )
        .child(
            Button::new("new-skill-proposal")
                .small()
                .primary()
                .label("Create proposal")
                .disabled(!ready)
                .on_click(cx.listener(|this, _, _, cx| create_proposal(this, cx))),
        )
        .when_some(
            action_status(
                workbench,
                PROPOSALS,
                "Proposal added to the review queue.",
                colors,
            ),
            |section, status| section.child(status),
        )
        .child(
            column(7.)
                .pt(px(10.))
                .border_t_1()
                .border_color(colors.divider)
                .child(
                    row().children(FILTERS.into_iter().map(|(choice, id, label)| {
                        let button =
                            Button::new(SharedString::from(format!("skill-proposals-filter-{id}")))
                                .small()
                                .label(label);
                        let button = if choice == state_filter {
                            button.outline()
                        } else {
                            button.ghost()
                        };
                        button.on_click(cx.listener(move |this, _, _, cx| {
                            this.connections.workshop.state_filter = choice;
                            cx.notify();
                        }))
                    })),
                )
                .child(Input::new(&filter).w_full())
                .when_some(
                    read_status(workbench, PROPOSALS, colors),
                    |section, status| section.child(status),
                )
                .when(
                    filtered.is_empty() && workbench.control_value(PROPOSALS).is_some(),
                    |section| section.child(muted(colors, "No matching proposals.")),
                )
                .children(filtered.into_iter().filter_map(|proposal| {
                    let id = text_at(Some(proposal), "id")
                        .filter(|id| valid_id(id))?
                        .to_owned();
                    let title = text_at(Some(proposal), "title")
                        .or_else(|| text_at(Some(proposal), "slug"))
                        .unwrap_or("Skill proposal")
                        .to_owned();
                    let status = text_at(Some(proposal), "disposition").unwrap_or("pending");
                    let action = Button::new(SharedString::from(format!("open-{id}")))
                        .small()
                        .label(if Some(id.as_str()) == selected {
                            "Selected"
                        } else {
                            "Review"
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.connections.fields.remove("skill-rejection-reason");
                            this.connections.workshop.selection = Some(id.clone());
                            this.control_get(&format!("{PROPOSALS}/{id}"), cx);
                        }));
                    Some(
                        row()
                            .justify_between()
                            .child(
                                column(2.)
                                    .child(div().child(title))
                                    .child(muted(colors, status.to_owned())),
                            )
                            .child(action),
                    )
                })),
        )
        .when_some(detail, |section, detail| section.child(detail))
}

fn create_proposal(workbench: &mut Workbench, cx: &mut Context<Workbench>) {
    let slug = value(workbench, "skill-proposal-slug", cx);
    let slug = slug.trim();
    let content = workbench
        .connections
        .workshop
        .content
        .as_ref()
        .map(|content| content.read(cx).value().to_string())
        .unwrap_or_default();
    let content = content.trim();
    if !valid_slug(slug) || content.is_empty() || content.encode_utf16().count() > 16_000 {
        workbench.connections.set_feedback(
            ConnectionsPage::Skills,
            "Enter a skill name and a SKILL.md body of at most 16,000 characters.",
        );
        cx.notify();
        return;
    }
    workbench
        .connections
        .feedback
        .remove(&ConnectionsPage::Skills);
    workbench.connections.workshop.submitting_slug = Some(slug.to_owned());
    workbench.control_send(
        ControlMethod::Post,
        PROPOSALS,
        Some(json!({"slug":slug,"content":content})),
        &[PROPOSALS],
        cx,
    );
}

fn review_detail(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Option<Div> {
    let id = workbench.connections.workshop.selection.as_ref()?.clone();
    let path = format!("{PROPOSALS}/{id}");
    let approve = format!("{path}/approve");
    let reject = format!("{path}/reject");
    let detail = workbench
        .control_value(&path)
        .and_then(|value| value.get("proposal"))
        .cloned();
    let box_input = input_field(
        workbench,
        "skill-rejection-reason",
        "",
        "Optional reason",
        false,
        window,
        cx,
    );
    let mut section = panel(colors, "Review proposal")
        .when_some(read_status(workbench, &path, colors), |section, status| {
            section.child(status)
        });
    let Some(detail) = detail else {
        return Some(section);
    };
    let title = text_at(Some(&detail), "title")
        .or_else(|| text_at(Some(&detail), "slug"))
        .unwrap_or("Skill proposal");
    let content = text_at(Some(&detail), "content").unwrap_or("No content returned.");
    let status = text_at(Some(&detail), "status")
        .or_else(|| text_at(Some(&detail), "disposition"))
        .unwrap_or("pending");
    let safety = safety(&detail).unwrap_or("unknown");
    let checks = values(Some(&detail), "findings");
    let can_decide = workbench.ready()
        && status == "pending"
        && !workbench.control_action_pending(&approve)
        && !workbench.control_action_pending(&reject);
    let can_activate = can_decide && matches!(safety, "clean" | "warn") && !content.is_empty();
    section = section
        .child(div().child(title.to_owned()))
        .child(muted(colors, format!("{status} · Safety {safety}")))
        .children(checks.iter().filter_map(|check| {
            let message = text_at(Some(check), "message")?;
            Some(notice(
                colors,
                message.to_owned(),
                text_at(Some(check), "outcome") == Some("blocked"),
            ))
        }))
        .child(
            div()
                .id("skill-proposal-content")
                .max_h(px(260.))
                .overflow_y_scroll()
                .bg(colors.rail)
                .p(px(8.))
                .text_sm()
                .child(content.chars().take(16_000).collect::<String>()),
        )
        .when_some(
            action_status(workbench, &approve, "Skill activated.", colors),
            |section, status| section.child(status),
        )
        .when_some(
            action_status(workbench, &reject, "Proposal rejected.", colors),
            |section, status| section.child(status),
        )
        .when(can_decide, |section| {
            section.child(field("Rejection reason", &box_input, colors, true))
        });
    let confirm_title = title.to_owned();
    let approve_path = path.clone();
    section = section.child(
        row()
            .child(
                Button::new("approve-skill-proposal")
                    .small()
                    .label("Approve & activate")
                    .disabled(!can_activate)
                    .on_click(cx.listener(move |_, _, window, cx| {
                        let request = window.prompt(
                            PromptLevel::Warning,
                            "Activate this skill?",
                            Some(&confirm_title),
                            &[
                                PromptButton::ok("Keep reviewing"),
                                PromptButton::new("Activate skill"),
                            ],
                            cx,
                        );
                        let approve = approve.clone();
                        let refresh = approve_path.clone();
                        cx.spawn_in(window, async move |this, cx| {
                            if request.await != Ok(1) {
                                return;
                            }
                            let _ = this.update_in(cx, |this, _, cx| {
                                let mut paths = AFTER_DECISION.to_vec();
                                paths.push(&refresh);
                                this.control_send(
                                    ControlMethod::Post,
                                    &approve,
                                    Some(json!({})),
                                    &paths,
                                    cx,
                                );
                            });
                        })
                        .detach();
                    })),
            )
            .child(
                Button::new("reject-skill-proposal")
                    .small()
                    .ghost()
                    .label("Reject proposal")
                    .disabled(!can_decide)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        let reason = value(this, "skill-rejection-reason", cx);
                        let mut paths = AFTER_DECISION.to_vec();
                        paths.push(&path);
                        this.control_send(
                            ControlMethod::Post,
                            &reject,
                            Some(json!({"reason":reason.trim()})),
                            &paths,
                            cx,
                        );
                    })),
            ),
    );
    Some(section)
}

fn safety(proposal: &Value) -> Option<&str> {
    text_at(Some(proposal), "safety")
}

fn valid_slug(slug: &str) -> bool {
    let lower_alnum = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
    (1..=63).contains(&slug.len())
        && lower_alnum(slug.as_bytes()[0])
        && slug.bytes().all(|byte| lower_alnum(byte) || byte == b'-')
}

fn valid_id(id: &str) -> bool {
    id.strip_prefix("skill-proposal-")
        .is_some_and(|tail| uuid::Uuid::parse_str(tail).is_ok() && tail.len() == 36)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_opaque_skill_proposal_ids_enter_the_route() {
        assert!(valid_id(
            "skill-proposal-6958a46a-4a5b-4b1c-8205-38a8cabb6341"
        ));
        assert!(!valid_id("skill-proposal-%2f../../approve"));
        assert!(valid_slug("workflow-1"));
        assert!(!valid_slug("Nested/workflow"));
    }
}
