use doolittle_runtime::ControlMethod;
use gpui::{AnyElement, Context, Window, div, prelude::*, px};
use gpui_component::{
    Disableable, Sizable,
    button::{Button, ButtonVariants},
};
use serde_json::{Value, json};

use crate::{ui::Palette, workbench::Workbench};

use super::{
    ConnectionsPage, LIVE_MODELS, MODELS, PROVIDER_ACCOUNTS, RUNTIME, SETTINGS, action_status,
    column, field, input_field, muted, notice, panel, read_status, row, text_at, value, values,
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
    let configured = workbench
        .control_value(SETTINGS)
        .and_then(|data| data.pointer("/settings/model"))
        .cloned();
    let Some(configured) = configured else {
        return panel(colors, "Model route")
            .child(
                read_status(workbench, SETTINGS, colors)
                    .unwrap_or_else(|| notice(colors, "Model settings are unavailable.", false)),
            )
            .into_any_element();
    };
    let ready = workbench.ready() && !workbench.control_action_pending(SETTINGS);
    let fields = MODEL_FIELDS
        .iter()
        .map(|(key, setting, label)| {
            let initial = display_setting(configured.get(*setting));
            let input = input_field(workbench, key, &initial, label, false, window, cx);
            field(label, &input, colors, ready)
        })
        .collect::<Vec<_>>();

    let source = if workbench.connections.show_live_models {
        LIVE_MODELS
    } else {
        MODELS
    };
    let provider = value(workbench, "model-provider", cx);
    let catalog = workbench
        .control_value(source)
        .or_else(|| workbench.control_value(MODELS));
    let providers = values(catalog, "providers");
    let provider_rows = providers
        .iter()
        .filter_map(|provider| {
            let id = text_at(Some(provider), "id")?.to_owned();
            let name = text_at(Some(provider), "label").unwrap_or(&id).to_owned();
            let model = values(Some(provider), "models")
                .iter()
                .find_map(|item| text_at(Some(item), "id"))
                .map(str::to_owned);
            let base_url = text_at(Some(provider), "baseUrl").map(str::to_owned);
            Some((id, name, model, base_url))
        })
        .collect::<Vec<_>>();
    let model_options = providers
        .iter()
        .find(|entry| text_at(Some(entry), "id") == Some(provider.trim()))
        .map(|entry| values(Some(entry), "models"))
        .unwrap_or_default()
        .iter()
        .filter_map(|entry| text_at(Some(entry), "id").map(str::to_owned))
        .take(40)
        .collect::<Vec<_>>();
    let configured_provider = text_at(Some(&configured), "provider").unwrap_or("No provider");
    let configured_model = text_at(Some(&configured), "model").unwrap_or("No model");
    panel(colors, "Model route")
        .child(muted(
            colors,
            format!("Current · {configured_provider} / {configured_model}"),
        ))
        .when(!provider_rows.is_empty(), |section| {
            section.child(row().children(provider_rows.into_iter().map(
                |(id, name, model, url)| {
                    let selected = provider == id;
                    let button = Button::new(gpui::SharedString::from(format!(
                        "model-catalog-provider-{id}"
                    )))
                    .small()
                    .label(name)
                    .disabled(!ready);
                    let button = if selected {
                        button.outline()
                    } else {
                        button.ghost()
                    };
                    button.on_click(cx.listener(move |this, _, window, cx| {
                        set_field(this, "model-provider", &id, window, cx);
                        set_field(
                            this,
                            "model-id",
                            model.as_deref().unwrap_or_default(),
                            window,
                            cx,
                        );
                        set_field(
                            this,
                            "model-base-url",
                            url.as_deref().unwrap_or_default(),
                            window,
                            cx,
                        );
                        set_field(this, "model-reasoning", "", window, cx);
                    }))
                },
            )))
        })
        .child(
            div().flex().flex_wrap().gap(px(10.)).children(
                fields
                    .into_iter()
                    .map(|field| field.flex_1().min_w(px(195.))),
            ),
        )
        .when(!model_options.is_empty(), |section| {
            section.child(column(4.).child(muted(colors, "Available models")).child(
                row().children(model_options.into_iter().enumerate().map(|(index, id)| {
                    Button::new(gpui::SharedString::from(format!(
                        "model-catalog-model-{index}"
                    )))
                    .ghost()
                    .small()
                    .label(id.clone())
                    .disabled(!ready)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        set_field(this, "model-id", &id, window, cx)
                    }))
                })),
            ))
        })
        .when_some(read_status(workbench, source, colors), |section, status| {
            section.child(status)
        })
        .when_some(
            action_status(
                workbench,
                SETTINGS,
                "Model settings saved. New turns will use this route.",
                colors,
            ),
            |section, status| section.child(status),
        )
        .child(
            row()
                .child(
                    Button::new("model-save")
                        .primary()
                        .small()
                        .label("Save model settings")
                        .disabled(!ready)
                        .on_click(cx.listener(|this, _, _, cx| save(this, cx))),
                )
                .child(
                    Button::new("model-reset-draft")
                        .ghost()
                        .small()
                        .label("Reset draft")
                        .disabled(!ready)
                        .on_click(cx.listener(|this, _, _, cx| {
                            for (key, _, _) in MODEL_FIELDS {
                                this.connections.fields.remove(key);
                            }
                            this.connections.feedback.remove(&ConnectionsPage::Models);
                            cx.notify();
                        })),
                )
                .child(
                    Button::new("model-discover")
                        .ghost()
                        .small()
                        .label("Discover live models")
                        .disabled(!ready || workbench.control_pending(LIVE_MODELS))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.connections.show_live_models = true;
                            this.control_get(LIVE_MODELS, cx);
                        })),
                ),
        )
        .into_any_element()
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
    match model_payload(&model) {
        Ok(body) => {
            workbench
                .connections
                .feedback
                .remove(&ConnectionsPage::Models);
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
mod tests {
    use super::*;

    #[test]
    fn model_form_rejects_non_finite_values_and_preserves_explicit_empty_reasoning() {
        let mut fields = ["openai", "gpt-4o-mini", "", "NaN", "1024", ""].map(str::to_owned);
        assert!(model_payload(&fields).is_err());
        fields[3] = "0.3".to_owned();
        assert!(model_payload(&fields).unwrap()["changes"][5]["value"].is_null());
        fields[4] = "0".to_owned();
        assert!(model_payload(&fields).is_err());
    }
}
