use markdown::{ParseOptions, mdast::Node, to_mdast};

/// GPUI's Markdown view supports clickable targets and remote images. Strip
/// those nodes and raw HTML from untrusted transcript text before rendering.
pub fn for_transcript(source: &str) -> String {
    if source.is_empty() {
        return String::new();
    }
    let Ok(root) = to_mdast(source, &ParseOptions::gfm()) else {
        return literal(source);
    };
    let mut replacement = Vec::new();
    collect_unsafe_nodes(&root, &mut replacement);
    let mut result = source.to_owned();
    for (range, text) in replacement.into_iter().rev() {
        result.replace_range(range, &text);
    }
    result
}

fn collect_unsafe_nodes(node: &Node, output: &mut Vec<(std::ops::Range<usize>, String)>) {
    let replacement = match node {
        Node::Link(_) | Node::LinkReference(_) => Some(literal(&node.to_string())),
        Node::Image(image) => Some(image_label(&image.alt)),
        Node::ImageReference(image) => Some(image_label(&image.alt)),
        Node::Html(html) => Some(literal(&html.value)),
        Node::Definition(_) => Some(String::new()),
        _ => None,
    };
    if let (Some(text), Some(position)) = (replacement, node.position()) {
        output.push((position.start.offset..position.end.offset, text));
    } else if let Some(children) = node.children() {
        for child in children {
            collect_unsafe_nodes(child, output);
        }
    }
}

fn image_label(alt: &str) -> String {
    if alt.trim().is_empty() {
        "(Image)".into()
    } else {
        literal(alt)
    }
}

fn literal(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        if character.is_ascii_punctuation() {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_targets_are_inert_but_positive_formatting_survives() {
        let text = for_transcript(
            "## Summary\n\n**Code**\n\n![alt](https://example.test/pixel) \
             [label](file:///secret) <img src=broken> www.example.test\n\n```rs\nlet x = [0];\n```",
        );
        assert!(text.contains("**Code**"));
        assert!(text.contains("alt label"));
        assert!(!text.contains("file:///secret"));
        assert!(text.contains("let x = [0];"));
        let ast = to_mdast(&text, &ParseOptions::gfm()).unwrap();
        let mut unsafe_nodes = Vec::new();
        collect_unsafe_nodes(&ast, &mut unsafe_nodes);
        assert!(unsafe_nodes.is_empty(), "{ast:?}");
    }

    #[test]
    fn preserves_unicode_and_code_while_neutralizing_references() {
        let text = for_transcript(concat!(
            "試す 🛠\n\n[ref][docs] ![][pixel]\n\n",
            "| Check | Result |\n| --- | --- |\n| File | **OK** |\n\n",
            "```sh\nprintf '%s' 'https://fixture.invalid'\n```\n\n",
            "[docs]: https://fixture.invalid/docs\n[pixel]: https://fixture.invalid/image",
        ));
        assert!(text.starts_with("試す 🛠"));
        assert!(text.contains("ref (Image)"));
        assert!(text.contains("| File | **OK** |"));
        assert!(text.contains("printf '%s' 'https://fixture.invalid'"));
        assert!(!text.contains("/docs"));
        assert!(!text.contains("/image"));
        let ast = to_mdast(&text, &ParseOptions::gfm()).unwrap();
        let mut unsafe_nodes = Vec::new();
        collect_unsafe_nodes(&ast, &mut unsafe_nodes);
        assert!(unsafe_nodes.is_empty(), "{ast:?}");
    }
}
