use super::*;

#[test]
fn refreshed_routes_preserve_only_conflicting_unsaved_edits() {
    let baseline = ["openai", "original", "", "0", "1024", ""].map(str::to_owned);
    let incoming = ["openai", "new-default", "", "0", "1024", ""].map(str::to_owned);
    let editing = ["openai", "unsaved", "", "0", "1024", ""].map(str::to_owned);
    assert!(!route_conflict(&baseline, &incoming, &baseline));
    assert!(!route_conflict(&baseline, &incoming, &incoming));
    assert!(route_conflict(&baseline, &incoming, &editing));
}

#[test]
fn model_form_rejects_non_finite_values_and_preserves_explicit_empty_reasoning() {
    let mut fields = ["openai", "gpt-4o-mini", "", "NaN", "1024", ""].map(str::to_owned);
    assert!(model_payload(&fields).is_err());
    fields[3] = "0.3".to_owned();
    assert!(model_payload(&fields).unwrap()["changes"][5]["value"].is_null());
    fields[4] = "0".to_owned();
    assert!(model_payload(&fields).is_err());
}
