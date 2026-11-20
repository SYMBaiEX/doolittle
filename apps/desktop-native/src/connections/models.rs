use doolittle_runtime::ControlMethod;
use gpui::{AnyElement, Context, Div, Window, prelude::*, px};
use gpui_component::{
    Disableable, IconName, Selectable, Sizable,
    button::{Button, ButtonVariants},
    menu::{DropdownMenu, PopupMenuItem},
};
use serde_json::{Value, json};

use crate::{ui::Palette, workbench::Workbench};

use super::{
    ConnectionsPage, LIVE_MODELS, MODELS, PROVIDER_ACCOUNTS, RUNTIME, SETTINGS, action_status,
    column, field, input_field, notice, panel, read_status, row, text_at, value, values,
};

const MODEL_FIELDS: [(&str, &str, &str); 6] = [
    ("model-provider", "provider", "Provider"),
    ("model-id", "model", "Model"),
    ("model-base-url", "baseUrl", "API base URL"),
    ("model-temperature", "temperature", "Temperature"),
    ("model-max-tokens", "maxTokens", "Maximum output tokens"),
    ("model-reasoning", "reasoningEffort", "Reasoning effort"),
];

pub(super) fn render(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let configured = configured_route(workbench);
    let Some(configured) = configured else {
        return panel(colors, "Model route")
            .child(read_status(workbench, SETTINGS, colors).unwrap_or_else(|| {
                notice(
                    colors,
                    "Model settings are unavailable. Use Retry to check again.",
                    false,
                )
            }))
            .into_any_element();
    };

    let draft = MODEL_FIELDS.map(|(key, _, _)| value(workbench, key, cx));
    let busy = workbench.control_action_pending(SETTINGS);
    let awaiting_settings = workbench.control_pending(SETTINGS);
    let saved_draft = if !busy && !awaiting_settings && workbench.control_error(SETTINGS).is_none()
    {
        workbench.connections.submitted_model.take().as_ref() == Some(&draft)
            && workbench.connections.settings_writer == Some(ConnectionsPage::Models)
            && workbench.control_action_value(SETTINGS).is_some()
    } else {
        false
    };
    let baseline = workbench.connections.model_baseline.as_ref();
    let conflict =
        !saved_draft && baseline.is_some_and(|saved| route_conflict(saved, &configured, &draft));
    if saved_draft || (baseline != Some(&configured) && !conflict) {
        reset_fields(workbench);
        workbench.connections.model_baseline = Some(configured.clone());
    }
    let ready = workbench.ready() && !busy;
    let fields = std::array::from_fn(|index| {
        let (key, _, label) = MODEL_FIELDS[index];
        input_field(workbench, key, &configured[index], label, false, window, cx)
    });

    let provider = value(workbench, "model-provider", cx);
    let model = value(workbench, "model-id", cx);
    let draft_has_edits = !conflict
        && !MODEL_FIELDS
            .iter()
            .zip(configured.iter())
            .all(|((key, _, _), saved)| value(workbench, key, cx) == *saved);
    let source = if workbench.connections.show_live_models {
        LIVE_MODELS
    } else {
        MODELS
    };
    let catalog = workbench
        .control_value(source)
        .or_else(|| workbench.control_value(MODELS));
    let providers = values(catalog, "providers");
    let provider_rows = providers.iter().filter_map(|provider| {
        let id = text_at(Some(provider), "id")?.to_owned();
        let name = text_at(Some(provider), "label").unwrap_or(&id).to_owned();
        let model = values(Some(provider), "models")
            .iter()
            .find_map(|item| text_at(Some(item), "id"))
            .map(str::to_owned);
        let url = text_at(Some(provider), "baseUrl").map(str::to_owned);
        Some((id, name, model, url))
    });
    let options: Vec<String> = providers
        .iter()
        .find(|entry| text_at(Some(entry), "id") == Some(provider.trim()))
        .map(|entry| values(Some(entry), "models"))
        .unwrap_or_default()
        .iter()
        .filter_map(|entry| text_at(Some(entry), "id").map(str::to_owned))
        .take(60)
        .collect();
    let selected_provider = super::accounts::provider_name(&configured[0]);
    let saved_route = if configured[0].is_empty() || configured[1].is_empty() {
        "No model selected".into()
    } else {
        format!("{selected_provider} · {}", configured[1])
    };

    let choosing = panel(colors, "Model route")
        .child(super::settings::item_row(colors, "Current default", saved_route))
        .child(
            row().children(provider_rows.map(|(id, name, model, url)| {
                Button::new(gpui::SharedString::from(format!("model-catalog-provider-{id}")))
                    .small()
                    .ghost()
                    .label(name)
                    .selected(provider.trim() == id)
                    .disabled(!ready)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        if value(this, "model-provider", cx).trim() == id { return; }
                        set_field(this, "model-provider", &id, window, cx);
                        set_field(this, "model-id", model.as_deref().unwrap_or_default(), window, cx);
                        set_field(this, "model-base-url", url.as_deref().unwrap_or_default(), window, cx);
                        set_field(this, "model-reasoning", "", window, cx);
                    }))
            })),
        )
        .child(row().items_start()
            .child(field("Provider", &fields[0], colors, ready).flex_1().min_w(px(128.)))
            .child(field("Model", &fields[1], colors, ready).flex_1().min_w(px(175.))))
        .child(row()
            .when(!options.is_empty(), |actions| actions.child(model_catalog(options, model.clone(), ready, cx)))
            .child(Button::new("model-discover").ghost().small()
                .label(if workbench.control_pending(LIVE_MODELS) { "Discovering models…" } else { "Refresh model catalog" })
                .disabled(!ready || workbench.control_pending(LIVE_MODELS))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.connections.show_live_models = true;
                    this.control_get(LIVE_MODELS, cx);
                }))))
        .when_some(read_status(workbench, source, colors), |section, status| section.child(status))
        .child(row().child(Button::new("model-options")
            .ghost().small()
            .label(if workbench.connections.model_options_open { "Hide advanced options" } else { "Advanced model options…" })
            .on_click(cx.listener(|this, _, _, cx| {
                this.connections.model_options_open = !this.connections.model_options_open;
                cx.notify();
            }))))
        .when(workbench.connections.model_options_open, |section| {
            section.child(advanced_options(colors, &fields, ready))
        })
        .when(conflict, |section| section.child(notice(colors, "The default changed while you were editing. Restore the current settings before editing again.", true)))
        .when(workbench.connections.settings_writer == Some(ConnectionsPage::Models), |section| {
            section.when_some(action_status(workbench, SETTINGS, "Model saved for new messages.", colors), |section, status| section.child(status))
        })
        .child(row()
            .child(Button::new("model-save").primary().small()
                .label(if busy { "Saving…" } else { "Save model" })
                .disabled(!ready || awaiting_settings || !draft_has_edits || provider.trim().is_empty() || model.trim().is_empty())
                .on_click(cx.listener(|this, _, _, cx| save(this, cx))))
            .when(conflict || draft_has_edits, |actions| actions.child(Button::new("model-reset-draft").ghost().small()
                .label("Restore current settings")
                .disabled(!ready || awaiting_settings)
                .on_click(cx.listener(|this, _, _, cx| {
                    reset_fields(this);
                    this.connections.model_baseline = None;
                    this.connections.feedback.remove(&ConnectionsPage::Models);
                    cx.notify();
                })))));
    column(0.)
        .child(choosing)
        .child(
            panel(colors, "Provider access").child(
                row()
                    .child(super::settings::route_button(
                        "model-open-accounts",
                        "Connect an account",
                        ConnectionsPage::Accounts,
                        cx,
                    ))
                    .child(super::settings::route_button(
                        "model-open-credentials",
                        "Add an API key",
                        ConnectionsPage::Credentials,
                        cx,
                    )),
            ),
        )
        .into_any_element()
}

fn model_catalog(
    options: Vec<String>,
    model: String,
    ready: bool,
    cx: &Context<Workbench>,
) -> impl gpui::IntoElement {
    let workbench = cx.entity().downgrade();
    Button::new("model-catalog")
        .ghost()
        .small()
        .label("Browse models")
        .icon(IconName::ChevronDown)
        .disabled(!ready)
        .dropdown_menu(move |mut menu, _, _| {
            menu = menu.scrollable(true).label("Available models");
            for id in &options {
                let selected = id == &model;
                let id = id.clone();
                let workbench = workbench.clone();
                menu = menu.item(PopupMenuItem::new(id.clone()).checked(selected).on_click(
                    move |_, window, cx| {
                        let _ = workbench
                            .update(cx, |this, cx| set_field(this, "model-id", &id, window, cx));
                    },
                ));
            }
            menu
        })
}

fn advanced_options(
    colors: &Palette,
    fields: &[gpui::Entity<gpui_component::input::InputState>; 6],
    ready: bool,
) -> Div {
    column(10.)
        .child(field("API base URL (optional)", &fields[2], colors, ready))
        .child(
            row()
                .items_start()
                .child(
                    field("Temperature", &fields[3], colors, ready)
                        .flex_1()
                        .min_w(px(100.)),
                )
                .child(
                    field("Maximum output tokens", &fields[4], colors, ready)
                        .flex_1()
                        .min_w(px(135.)),
                )
                .child(
                    field("Reasoning effort (optional)", &fields[5], colors, ready)
                        .flex_1()
                        .min_w(px(150.)),
                ),
        )
}

fn configured_route(workbench: &Workbench) -> Option<[String; 6]> {
    let model = workbench
        .control_value(SETTINGS)?
        .pointer("/settings/model")?;
    Some(MODEL_FIELDS.map(|(_, setting, _)| display_setting(model.get(setting))))
}

fn reset_fields(workbench: &mut Workbench) {
    for (key, _, _) in MODEL_FIELDS {
        workbench.connections.fields.remove(key);
    }
}

fn route_conflict(saved: &[String; 6], current: &[String; 6], draft: &[String; 6]) -> bool {
    saved != current && saved != draft && current != draft
}

fn set_field(
    workbench: &Workbench,
    key: &str,
    value: &str,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    if let Some(field) = workbench.connections.fields.get(key) {
        let value = value.to_owned();
        field
            .input
            .update(cx, |input, cx| input.set_value(value, window, cx));
    }
}

fn display_setting(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => String::new(),
    }
}

fn model_payload(fields: &[String; 6]) -> Result<Value, &'static str> {
    let [
        provider,
        model,
        base_url,
        temperature,
        max_tokens,
        reasoning,
    ] = fields.each_ref().map(|value| value.trim());
    if provider.is_empty()
        || model.is_empty()
        || provider.len() > 160
        || model.encode_utf16().count() > 160
        || base_url.len() > 2048
    {
        return Err("Enter a provider and model to save the route.");
    }
    let temperature = temperature
        .parse::<f64>()
        .ok()
        .filter(|value| (0.0..=2.0).contains(value))
        .ok_or("Enter a temperature between 0 and 2.")?;
    let max_tokens = max_tokens
        .parse::<u32>()
        .ok()
        .filter(|value| (1..=1_000_000).contains(value))
        .ok_or("Enter a positive whole number for maximum output tokens.")?;
    let reasoning = (!reasoning.is_empty()).then_some(reasoning);
    Ok(json!({"changes":[
        {"path":"model.provider","value":provider}, {"path":"model.model","value":model},
        {"path":"model.baseUrl","value":base_url}, {"path":"model.temperature","value":temperature},
        {"path":"model.maxTokens","value":max_tokens}, {"path":"model.reasoningEffort","value":reasoning},
    ]}))
}

fn save(workbench: &mut Workbench, cx: &mut Context<Workbench>) {
    let model = MODEL_FIELDS.map(|(key, _, _)| value(workbench, key, cx));
    if workbench.control_pending(SETTINGS)
        || workbench.control_action_pending(SETTINGS)
        || workbench.connections.model_baseline != configured_route(workbench)
    {
        return;
    }
    match model_payload(&model) {
        Ok(body) => {
            workbench
                .connections
                .feedback
                .remove(&ConnectionsPage::Models);
            workbench.connections.settings_writer = Some(ConnectionsPage::Models);
            workbench.connections.submitted_model = Some(model);
            workbench.control_send(
                ControlMethod::Post,
                SETTINGS,
                Some(body),
                &[SETTINGS, RUNTIME, PROVIDER_ACCOUNTS],
                cx,
            );
        }
        Err(message) => {
            workbench
                .connections
                .set_feedback(ConnectionsPage::Models, message);
            cx.notify();
        }
    }
}

#[cfg(test)]
#[path = "../../../../tests/native/settings_models.rs"]
mod tests;
