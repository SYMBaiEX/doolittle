use std::{path::Path, sync::Arc};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use gpui::{ClipboardItem, Image, ImageFormat, img};

use super::*;

pub(super) const LIBRARY: &str = "/media/library";
const MAX_ASSET_BYTES: usize = 5 * 1024 * 1024;
const MAX_ENCODED_BYTES: usize = MAX_ASSET_BYTES.div_ceil(3) * 4;

#[derive(Default)]
pub(super) struct MediaState {
    this_chat: bool,
    kind: Option<&'static str>,
    query: String,
    selected: Option<String>,
    page_generation: u64,
    preview: Option<Result<Arc<Preview>, String>>,
    export_result: Option<Result<String, String>>,
}

enum AssetData {
    Raster(Arc<Image>),
    Bytes(Vec<u8>),
}

struct Preview {
    name: String,
    bytes: AssetData,
}

impl Preview {
    fn decode(payload: Value, expected: &str) -> Result<Self, String> {
        let media = &payload["asset"];
        let mime = value(media, "mimeType");
        let reported = media["sizeBytes"].as_u64().unwrap_or_default();
        if value(media, "id") != expected
            || value(&payload, "encoding") != "base64"
            || reported == 0
            || reported > MAX_ASSET_BYTES as u64
        {
            return Err("The runtime returned an invalid asset receipt.".to_owned());
        }
        let content = value(&payload, "content");
        if content.len() > MAX_ENCODED_BYTES {
            return Err("This asset exceeds the preview size limit.".to_owned());
        }
        let pixels = STANDARD
            .decode(content)
            .map_err(|_| "The asset contained invalid data.".to_owned())?;
        if pixels.len() as u64 != reported || pixels.len() > MAX_ASSET_BYTES {
            return Err("The received asset size differs from its receipt.".to_owned());
        }
        let bytes = match ImageFormat::from_mime_type(mime) {
            Some(
                format @ (ImageFormat::Png
                | ImageFormat::Jpeg
                | ImageFormat::Webp
                | ImageFormat::Gif),
            ) => AssetData::Raster(Arc::new(Image::from_bytes(format, pixels))),
            _ => AssetData::Bytes(pixels),
        };
        let name = Path::new(value(media, "name"))
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| {
                !name.is_empty() && !name.contains('\\') && !name.chars().any(char::is_control)
            })
            .unwrap_or("doolittle-asset")
            .to_owned();
        Ok(Self { name, bytes })
    }

    fn content(&self) -> &[u8] {
        match &self.bytes {
            AssetData::Raster(image) => &image.bytes,
            AssetData::Bytes(bytes) => bytes,
        }
    }
}

fn path(this: &Workbench) -> String {
    if !this.operations.media.this_chat || !segment(&this.selected) {
        LIBRARY.to_owned()
    } else {
        format!("{LIBRARY}?sessionId={}", encode_query(&this.selected))
    }
}

pub(super) fn refresh(this: &mut Workbench, cx: &mut Context<Workbench>) {
    let route = path(this);
    this.control_get(&route, cx);
}

pub(super) fn render(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let search = this
        .operations
        .search("media-filter", "Search assets", apply_search, window, cx);
    let route = path(this);
    let media = &this.operations.media;
    let assets: Vec<_> = records(this, &route, "assets")
        .iter()
        .filter(|asset| {
            media.kind.is_none_or(|kind| value(asset, "kind") == kind)
                && (media.query.is_empty()
                    || ["name", "provider", "prompt"]
                        .into_iter()
                        .any(|key| value(asset, key).to_lowercase().contains(&media.query)))
        })
        .collect();
    let selected = media.selected.as_deref().and_then(|id| {
        assets
            .iter()
            .find(|asset| value(asset, "id") == id)
            .copied()
    });
    let wide = this.content_width(window, cx) >= px(880.);
    let library = scroll("media-asset-library")
        .children(load_state(
            this,
            &route,
            colors,
            if !media.query.is_empty() || media.kind.is_some() {
                "No assets match these filters."
            } else if media.this_chat {
                "No assets in the selected chat."
            } else {
                "Images, audio, and video created here will appear in your library."
            },
            !assets.is_empty(),
        ))
        .children(assets.iter().map(|asset| asset_row(asset, colors, cx)));
    let body = if let Some(asset) = selected {
        let detail = scroll("media-asset-preview").child(details(this, asset, colors, cx));
        if wide {
            div()
                .flex()
                .flex_1()
                .min_h_0()
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .w(gpui::relative(0.45))
                        .min_w_0()
                        .border_r_1()
                        .border_color(colors.divider)
                        .child(library),
                )
                .child(div().flex().flex_col().flex_1().min_w_0().child(detail))
        } else {
            div().flex().flex_col().flex_1().min_h_0().child(detail)
        }
    } else {
        div().flex().flex_col().flex_1().min_h_0().child(library)
    };
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            row(colors)
                .child(
                    group()
                        .child(search_field(&search))
                        .child(
                            button("media-search")
                                .small()
                                .outline()
                                .label("Search")
                                .on_click(cx.listener(|this, _, _, cx| apply_search(this, cx))),
                        )
                        .children([(false, "All chats"), (true, "This chat")].into_iter().map(
                            |(scope, label)| {
                                tab(("media-scope", label), label, media.this_chat == scope)
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        if this.operations.media.this_chat != scope {
                                            this.operations.media.this_chat = scope;
                                            close_asset(this, cx);
                                            refresh(this, cx);
                                        }
                                    }))
                            },
                        )),
                )
                .child(
                    group().children(
                        [
                            (None, "All assets"),
                            (Some("image"), "Images"),
                            (Some("audio"), "Audio"),
                            (Some("video"), "Video"),
                        ]
                        .into_iter()
                        .map(|(kind, label)| {
                            tab(("media-kind", label), label, media.kind == kind).on_click(
                                cx.listener(move |this, _, _, cx| {
                                    if this.operations.media.kind != kind {
                                        this.operations.media.kind = kind;
                                        close_asset(this, cx);
                                    }
                                }),
                            )
                        }),
                    ),
                ),
        )
        .child(body)
        .into_any_element()
}

fn apply_search(this: &mut Workbench, cx: &mut Context<Workbench>) {
    let query = this.operations.query("media-filter", cx).to_lowercase();
    if this.operations.media.query != query {
        this.operations.media.query = query;
        close_asset(this, cx);
    }
}

fn close_asset(this: &mut Workbench, cx: &mut Context<Workbench>) {
    let media = &mut this.operations.media;
    media.selected = None;
    media.preview = None;
    media.export_result = None;
    cx.notify();
}

fn asset_row(asset: &Value, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let id = value(asset, "id").to_owned();
    let bytes = asset["sizeBytes"].as_u64().unwrap_or_default();
    row(colors).child(
        div()
            .flex()
            .items_center()
            .gap(px(12.))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(heading(title(asset, "name", "Asset").to_owned()))
                    .child(muted(
                        colors,
                        format!(
                            "{} · {} KiB · {}",
                            title(asset, "kind", "media"),
                            bytes.div_ceil(1024),
                            value(asset, "createdAt")
                        ),
                    )),
            )
            .when(asset_id(&id), |row| {
                row.child(
                    button(format!("asset-{id}"))
                        .small()
                        .ghost()
                        .label("View")
                        .on_click(
                            cx.listener(move |this, _, _, cx| load_preview(this, id.clone(), cx)),
                        ),
                )
            }),
    )
}

fn asset_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 181
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn load_preview(this: &mut Workbench, id: String, cx: &mut Context<Workbench>) {
    let Some(client) = this.runtime_client().filter(|_| asset_id(&id)) else {
        return;
    };
    let media = &mut this.operations.media;
    media.page_generation = media.page_generation.wrapping_add(1);
    let generation = media.page_generation;
    media.selected = Some(id.clone());
    media.preview = None;
    media.export_result = None;
    let requested_id = id.clone();
    let (tx, rx) = async_channel::bounded(1);
    std::thread::spawn(move || {
        let requested = format!("{LIBRARY}/{requested_id}");
        let result = client
            .control(ControlMethod::Get, &requested, None)
            .map_err(|error| error.to_string())
            .and_then(|payload| Preview::decode(payload, &requested_id).map(Arc::new));
        let _ = tx.send_blocking(result);
    });
    cx.spawn(async move |this, cx| {
        let Ok(result) = rx.recv().await else {
            return;
        };
        let _ = this.update(cx, |this, cx| {
            let media = &mut this.operations.media;
            if media.page_generation == generation && media.selected.as_deref() == Some(&id) {
                media.preview = Some(result);
                cx.notify();
            }
        });
    })
    .detach();
    cx.notify();
}

fn details(this: &Workbench, asset: &Value, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let prompt = value(asset, "prompt").to_owned();
    let id = value(&asset["origin"], "sessionId").to_owned();
    let selection = &this.operations.media;
    let mut detail = panel(colors, "Selected asset").child(
        row(colors)
            .child(
                group()
                    .justify_between()
                    .child(heading(title(asset, "name", "Managed asset").to_owned()))
                    .child(
                        button("close-asset")
                            .small()
                            .ghost()
                            .label("Back to library")
                            .on_click(cx.listener(|this, _, _, cx| close_asset(this, cx))),
                    ),
            )
            .when(!prompt.is_empty(), |row| row.child(prompt.clone()))
            .child(muted(
                colors,
                format!(
                    "{} · {}",
                    title(asset, "provider", "Provider"),
                    title(asset, "model", "Model")
                ),
            ))
            .child(
                group()
                    .when(!prompt.is_empty(), |row| {
                        row.child(
                            button("copy-asset-prompt")
                                .small()
                                .outline()
                                .label("Copy prompt")
                                .on_click(cx.listener(move |_, _, _, cx| {
                                    cx.write_to_clipboard(ClipboardItem::new_string(prompt.clone()))
                                })),
                        )
                    })
                    .when(segment(&id), |row| {
                        row.child(
                            button("open-asset-chat")
                                .small()
                                .outline()
                                .label("Open chat")
                                .on_click(cx.listener(move |this, _, window, cx| {
                                    this.select_conversation(id.clone(), None, window, cx)
                                })),
                        )
                    }),
            ),
    );
    match selection.preview.as_ref() {
        None => detail = detail.child(empty(colors, "Loading asset…")),
        Some(Err(message)) => {
            let asset_id = value(asset, "id").to_owned();
            detail = detail.child(
                row(colors).child(error(colors, message.clone())).child(
                    button("retry-asset-preview")
                        .small()
                        .outline()
                        .label("Reload asset")
                        .on_click(cx.listener(move |this, _, _, cx| {
                            load_preview(this, asset_id.clone(), cx)
                        })),
                ),
            )
        }
        Some(Ok(data)) => {
            let data = data.clone();
            let playable = matches!(value(asset, "kind"), "audio" | "video");
            if let AssetData::Raster(image) = &data.bytes {
                let muted = colors.muted;
                detail = detail.child(img(image.clone()).w_full().h(px(340.)).bg(colors.inset).with_fallback(move || {
                    div().text_color(muted).child("Image preview unavailable. The original file can still be saved.").into_any_element()
                }));
            }
            detail = detail.child(
                row(colors)
                    .child(
                        group().child(
                            button("save-managed-asset")
                                .small()
                                .primary()
                                .label(if playable {
                                    "Save and open in player"
                                } else {
                                    "Save original"
                                })
                                .on_click(cx.listener(move |_, _, _, cx| {
                                    export(data.clone(), playable, cx)
                                })),
                        ),
                    )
                    .children(selection.export_result.as_ref().map(|result| match result {
                        Ok(message) => muted(colors, message.clone()),
                        Err(message) => error(colors, message.clone()),
                    })),
            );
        }
    }
    detail
}

fn export(data: Arc<Preview>, open_player: bool, cx: &mut Context<Workbench>) {
    let directory = std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir());
    let target = cx.prompt_for_new_path(&directory, Some(&data.name));
    cx.spawn(async move |this, cx| {
        let result = match target.await {
            Ok(Ok(Some(path))) => {
                cx.background_executor()
                    .spawn(async move {
                        std::fs::write(&path, data.content())
                            .map(|()| path)
                            .map_err(|error| error.to_string())
                    })
                    .await
            }
            Ok(Err(error)) => Err(error.to_string()),
            _ => return,
        };
        let _ = this.update(cx, |this, cx| {
            if let Ok(path) = &result
                && open_player
            {
                cx.open_with_system(path);
            }
            this.operations.media.export_result = Some(result.map(|_| "Asset saved.".to_owned()));
            cx.notify();
        });
    })
    .detach();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn preview_requires_exact_identity_and_byte_count() {
        let body = json!({"asset":{"id":"asset-1", "name":"image.png", "sizeBytes":3,"mimeType":"image/png"},"encoding":"base64","content":"YWJj"});
        assert!(Preview::decode(body.clone(), "asset-2").is_err());
        let preview = Preview::decode(body, "asset-1").expect("valid payload");
        assert_eq!(preview.content(), b"abc");
        assert!(matches!(preview.bytes, AssetData::Raster(_)));
        assert!(!asset_id("..%2fprivate"));
    }
}
