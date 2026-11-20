use super::*;

#[test]
fn work_queue_uses_native_overview_counts() {
    let response = json!({
        "overview": {
            "local": {"total": 1, "pending": 0, "running": 0},
            "native": {"total": 5, "pending": 3, "running": 1}
        }
    });
    assert_eq!(
        queue_counts(&response).as_deref(),
        Some("5 tasks · 3 pending · 1 running")
    );
    assert_eq!(queue_counts(&json!({"overview": {}})), None);
}

#[test]
fn opening_review_defaults_to_approvals_without_requesting_repository_data() {
    assert_eq!(ReviewTab::default().routes(), &[APPROVALS]);
    assert!(
        ReviewTab::Changes
            .routes()
            .contains(&super::review::REPOSITORY)
    );
}
