use gpui::{AnyElement, ClipboardItem, Context, FontWeight, div, prelude::*, px};
use gpui_component::{
    Sizable,
    button::{Button, ButtonVariants},
};
use serde_json::Value;

use crate::{ui::Palette, workbench::Workbench};

/// ElizaOS owns signing and submission. Only display the public receipt fields.
pub(crate) fn render(
    receipt: &Value,
    id: String,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Option<AnyElement> {
    let (title, state) = labels(receipt)?;
    let chain = label(receipt.get("chain")?.as_str()?)?;
    let amount = receipt
        .get("amount")
        .and_then(Value::as_str)
        .and_then(decimal);
    let from = receipt
        .get("fromToken")
        .and_then(Value::as_str)
        .and_then(label);
    let to = receipt
        .get("toToken")
        .and_then(Value::as_str)
        .and_then(label);
    let source = [amount, from]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    let tokens = match to {
        Some(to) if source.is_empty() => to.to_owned(),
        Some(to) => format!("{source} → {to}"),
        None => source,
    };
    let transaction = receipt
        .get("transactionId")
        .and_then(Value::as_str)
        .filter(|value| transaction_id(value));
    Some(
        div()
            .flex()
            .flex_col()
            .min_w_0()
            .gap(px(6.))
            .my(px(4.))
            .p(px(10.))
            .rounded(px(6.))
            .border_1()
            .border_color(colors.divider)
            .bg(colors.inset)
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .justify_between()
                    .gap(px(6.))
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(format!("{title} · {chain}")),
                    )
                    .child(div().text_sm().text_color(colors.muted).child(state)),
            )
            .when(!tokens.is_empty(), |card| {
                card.child(div().text_sm().child(tokens))
            })
            .when_some(transaction, |card, transaction| {
                let copy = transaction.to_owned();
                card.child(
                    div()
                        .flex()
                        .items_center()
                        .min_w_0()
                        .gap(px(6.))
                        .child(
                            div()
                                .flex_1()
                                .truncate()
                                .text_sm()
                                .text_color(colors.muted)
                                .child(format!("Transaction · {transaction}")),
                        )
                        .child(
                            Button::new(gpui::SharedString::from(id))
                                .ghost()
                                .small()
                                .label("Copy transaction")
                                .on_click(cx.listener(move |_, _, _, cx| {
                                    cx.write_to_clipboard(ClipboardItem::new_string(copy.clone()));
                                })),
                        ),
                )
            })
            .into_any_element(),
    )
}

fn labels(receipt: &Value) -> Option<(&'static str, &'static str)> {
    let title = match receipt.get("subaction")?.as_str()? {
        "transfer" => "Transfer",
        "swap" => "Swap",
        "bridge" => "Bridge",
        "gov" => "Governance",
        _ => return None,
    };
    let mode = receipt.get("mode")?.as_str()?;
    if !matches!(mode, "prepare" | "execute") {
        return None;
    }
    let state = match (
        receipt.get("status")?.as_str()?,
        receipt.get("dryRun")?.as_bool()?,
    ) {
        ("prepared", true) => "Simulation · not sent",
        ("prepared", false) => "Prepared · not sent",
        ("submitted", false) if mode == "execute" => "Submitted · awaiting confirmation",
        _ => return None,
    };
    Some((title, state))
}

fn label(value: &str) -> Option<&str> {
    let valid = (1..=80).contains(&value.len())
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b" ._:-".contains(&byte));
    valid.then_some(value)
}

fn decimal(value: &str) -> Option<&str> {
    let mut parts = value.split('.');
    let digits = |part: &str| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit());
    let valid = value.len() <= 80
        && parts.next().is_some_and(digits)
        && parts.next().is_none_or(digits)
        && parts.next().is_none();
    valid.then_some(value)
}

fn transaction_id(value: &str) -> bool {
    if let Some(hex) = value.strip_prefix("0x") {
        hex.len() == 64 && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
    } else {
        (64..=88).contains(&value.len())
            && value.bytes().all(|byte| {
                b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".contains(&byte)
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn submitted_wallet_receipt_requires_an_actual_execution() {
        let mut value =
            json!({"subaction":"transfer", "status":"submitted", "mode":"execute", "dryRun":false});
        assert_eq!(
            labels(&value),
            Some(("Transfer", "Submitted · awaiting confirmation"))
        );
        value["dryRun"] = true.into();
        assert_eq!(labels(&value), None);
        value["dryRun"] = false.into();
        value["mode"] = "prepare".into();
        assert_eq!(labels(&value), None);
    }

    #[test]
    fn hides_untrusted_transaction_and_metadata_values() {
        assert!(transaction_id(&format!("0x{}", "a".repeat(64))));
        assert!(!transaction_id(&"0".repeat(64)));
        assert_eq!(label("Solana mainnet"), Some("Solana mainnet"));
        assert_eq!(label("unexpected\nmetadata"), None);
        assert_eq!(decimal("0.031"), Some("0.031"));
        assert_eq!(decimal("1e8"), None);
        assert_eq!(decimal("1.2.3"), None);
    }
}
