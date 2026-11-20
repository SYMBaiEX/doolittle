use super::rank;

#[test]
fn search_matches_exact_prefix_and_multiple_terms_in_order() {
    assert_eq!(rank("Agents", "agents"), Some(0));
    assert_eq!(rank("Model settings", "model"), Some(1));
    assert_eq!(rank("Model settings", "settings model"), Some(2));
    assert_eq!(rank("Model settings", "settings webhook"), None);
}
