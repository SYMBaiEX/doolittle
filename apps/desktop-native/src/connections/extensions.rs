use doolittle_runtime::ControlMethod;
use gpui::{Context, Div, Window, prelude::*};
use gpui_component::{
    Disableable, Sizable,
    button::{Button, ButtonVariants},
    input::Input,
};
use serde_json::Value;

use super::{
    ConnectionsPage, column, input_field, muted, notice, panel, read_status, request_action, row,
    settings::{catalog_row, item_row},
    text_at, value, values,
};
use crate::{ui::Palette, workbench::Workbench};

pub(super) const MCP_CACHED: &str = "/mcp/cached";
pub(super) const REGISTRY: &str = "/runtime/registry";
const MCP_STATUS: &str = "/mcp/status";
const MCP_PROBE: &str = "/mcp/probe";
const MARKET: &str = "/mcp/marketplace";

#[derive(Default)]
pub(super) struct CatalogState {
    mcp_detail: Option<String>,
    marketplace_query: Option<String>,
    marketplace_detail: Option<String>,
    registry_query: Option<String>,
}

pub(super) fn mcp(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let cached = input_field(
        workbench,
        "mcp-tool-filter",
        "",
        "Filter cached tools",
        false,
        window,
        cx,
    );
    let marketplace = input_field(
        workbench,
        "mcp-market-query",
        "",
        "Search MCP servers",
        false,
        window,
        cx,
    );
    let filter = value(workbench, "mcp-tool-filter", cx)
        .trim()
        .to_lowercase();
    let status = workbench
        .control_value(MCP_STATUS)
        .and_then(|response| response.get("mcp"));
    let servers = values(status, "servers");
    let tools = values(workbench.control_value(MCP_CACHED), "tools");
    let probe = workbench
        .control_action_value(MCP_PROBE)
        .and_then(|data| data.get("probe"));
    let ready = workbench.ready();
    let probing = workbench.control_action_pending(MCP_PROBE);
    let status_chip = status
        .and_then(|value| value.get("enabled"))
        .and_then(Value::as_bool)
        .map(|flag| if flag { "Configured" } else { "Unconfigured" })
        .unwrap_or("Awaiting status");
    let response = panel(colors, "Model Context Protocol")
        .child(
            row()
                .justify_between()
                .child(muted(colors, status_chip))
                .child(request_action(
                    "mcp-probe-now",
                    "Check MCP connection",
                    ready && !probing,
                    (ControlMethod::Post, MCP_PROBE),
                    None,
                    &[MCP_STATUS, MCP_CACHED],
                    cx,
                )),
        )
        .child(item_row(
            colors,
            "Connected servers",
            status
                .and_then(|data| data.get("connectedServers"))
                .and_then(Value::as_u64)
                .unwrap_or_default()
                .to_string(),
        ))
        .when_some(
            read_status(workbench, MCP_STATUS, colors),
            |section, state| section.child(state),
        )
        .when_some(
            workbench.control_action_error(MCP_PROBE),
            |section, error| section.child(notice(colors, error.to_owned(), true)),
        )
        .when_some(probe, |section, probe| {
            section.child(muted(
                colors,
                text_at(Some(probe), "message")
                    .or_else(|| text_at(Some(probe), "status"))
                    .unwrap_or("Connection check finished.")
                    .to_owned(),
            ))
        })
        .children(servers.iter().map(|server| catalog_row(colors, server)));
    let cached_list = panel(colors, "Cached MCP tools")
        .child(Input::new(&cached).w_full())
        .when_some(
            read_status(workbench, MCP_CACHED, colors),
            |section, state| section.child(state),
        )
        .when(
            tools.is_empty() && workbench.control_value(MCP_CACHED).is_some(),
            |section| section.child(muted(colors, "No tools are cached for configured servers.")),
        )
        .children(
            tools
                .iter()
                .enumerate()
                .filter_map(|(index, tool)| {
                    let name = text_at(Some(tool), "name")?;
                    let description = text_at(Some(tool), "description").unwrap_or_default();
                    if !filter.is_empty()
                        && !format!("{name} {description}")
                            .to_lowercase()
                            .contains(&filter)
                    {
                        return None;
                    }
                    let name = name.to_owned();
                    let button = Button::new(("mcp-tool-open", index))
                        .small()
                        .ghost()
                        .label("Inspect")
                        .disabled(!ready)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            let path = query_route("/mcp/tool", &[("name", &name)]);
                            this.connections.catalog.mcp_detail = Some(path.clone());
                            this.control_get(&path, cx);
                        }));
                    Some(
                        row()
                            .justify_between()
                            .child(catalog_row(colors, tool))
                            .child(button),
                    )
                })
                .take(120),
        )
        .when_some(mcp_tool_detail(workbench, colors), |section, detail| {
            section.child(detail)
        });
    let query_path = workbench.connections.catalog.marketplace_query.as_deref();
    let result = query_path
        .and_then(|path| workbench.control_value(path))
        .and_then(|response| response.get("marketplace"));
    let pending = query_path.is_some_and(|path| workbench.control_pending(path));
    let market = panel(colors, "MCP marketplace")
        .child(
            row().child(Input::new(&marketplace).flex_1()).child(
                Button::new("mcp-market-search")
                    .small()
                    .label("Search")
                    .disabled(!ready || pending)
                    .on_click(
                        cx.listener(|this, _, _, cx| search(this, SearchArea::Marketplace, cx)),
                    ),
            ),
        )
        .when_some(
            query_path.and_then(|path| read_status(workbench, path, colors)),
            |section, state| section.child(state),
        )
        .when_some(text_at(result, "error"), |section, error| {
            section.child(notice(colors, error.to_owned(), true))
        })
        .when(
            result.is_some() && values(result, "results").is_empty(),
            |section| section.child(muted(colors, "No matching servers.")),
        )
        .children(
            values(result, "results")
                .iter()
                .enumerate()
                .filter_map(|(index, server)| {
                    let name = text_at(Some(server), "name")?.to_owned();
                    let button = Button::new(("mcp-marketplace-open", index))
                        .small()
                        .ghost()
                        .label("Inspect")
                        .disabled(!ready)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            let path = query_route("/mcp/marketplace/server", &[("name", &name)]);
                            this.connections.catalog.marketplace_detail = Some(path.clone());
                            this.control_get(&path, cx);
                        }));
                    Some(
                        row()
                            .justify_between()
                            .child(catalog_row(colors, server))
                            .child(button),
                    )
                }),
        )
        .when_some(mcp_market_detail(workbench, colors), |section, detail| {
            section.child(detail)
        });
    column(16.).child(response).child(cached_list).child(market)
}

fn mcp_tool_detail(workbench: &Workbench, colors: &Palette) -> Option<Div> {
    let path = workbench.connections.catalog.mcp_detail.as_deref()?;
    let mut section = panel(colors, "Tool details")
        .when_some(read_status(workbench, path, colors), |section, status| {
            section.child(status)
        });
    if let Some(tool) = workbench
        .control_value(path)
        .and_then(|response| response.get("tool"))
        .filter(|value| value.is_object())
    {
        section = section.child(catalog_row(colors, tool));
        if let Some(schema) = tool
            .pointer("/inputSchema/properties")
            .and_then(Value::as_object)
        {
            section = section.child(
                column(4.)
                    .child(muted(colors, "Input properties"))
                    .children(schema.iter().take(30).map(|(key, value)| {
                        item_row(
                            colors,
                            key.to_owned(),
                            text_at(Some(value), "type").unwrap_or("any").to_owned(),
                        )
                    })),
            );
        }
    } else if workbench.control_value(path).is_some() {
        section = section.child(muted(colors, "The cached tool is unavailable."));
    }
    Some(section)
}

fn mcp_market_detail(workbench: &Workbench, colors: &Palette) -> Option<Div> {
    let path = workbench
        .connections
        .catalog
        .marketplace_detail
        .as_deref()?;
    let response = workbench
        .control_value(path)
        .and_then(|value| value.get("marketplace"));
    let server = response
        .and_then(|response| response.get("server"))
        .filter(|value| value.is_object());
    Some(
        panel(colors, "Marketplace server")
            .when_some(read_status(workbench, path, colors), |section, status| {
                section.child(status)
            })
            .when_some(text_at(response, "error"), |section, error| {
                section.child(notice(colors, error.to_owned(), true))
            })
            .when_some(server, |section, server| {
                section.child(catalog_row(colors, server)).when_some(
                    text_at(Some(server), "connectionType"),
                    |detail, transport| {
                        detail.child(item_row(colors, "Transport", transport.to_owned()))
                    },
                )
            }),
    )
}

pub(super) fn registry(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let input = input_field(
        workbench,
        "registry-search",
        "",
        "Find a registry package",
        false,
        window,
        cx,
    );
    let path = workbench
        .connections
        .catalog
        .registry_query
        .as_deref()
        .unwrap_or(REGISTRY);
    let result = workbench.control_value(path);
    let entries = ["results", "entries", "registries"]
        .into_iter()
        .find_map(|key| {
            result
                .and_then(|result| result.get(key))
                .and_then(Value::as_array)
                .map(Vec::as_slice)
        })
        .unwrap_or_default();
    let ready = workbench.ready() && !workbench.control_pending(path);
    panel(colors, "Registry packages")
        .child(
            row()
                .child(Input::new(&input).flex_1())
                .child(
                    Button::new("registry-run-search")
                        .small()
                        .label("Search registry")
                        .disabled(!ready)
                        .on_click(
                            cx.listener(|this, _, _, cx| search(this, SearchArea::Registry, cx)),
                        ),
                )
                .child(
                    Button::new("registry-reset-query")
                        .small()
                        .ghost()
                        .label("Show index")
                        .disabled(!ready || path == REGISTRY)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.connections.catalog.registry_query = None;
                            this.connections.feedback.remove(&ConnectionsPage::Registry);
                            this.control_get(REGISTRY, cx);
                        })),
                ),
        )
        .when_some(read_status(workbench, path, colors), |section, status| {
            section.child(status)
        })
        .when(result.is_some(), |section| {
            section.child(muted(colors, format!("{} entries", entries.len())))
        })
        .children(entries.iter().take(350).map(|entry| {
            let reasons = values(entry.get("policy"), "reasons");
            catalog_row(colors, entry).children(
                reasons
                    .iter()
                    .filter_map(Value::as_str)
                    .take(3)
                    .map(|reason| muted(colors, reason.to_owned())),
            )
        }))
}

enum SearchArea {
    Marketplace,
    Registry,
}

fn search(this: &mut Workbench, area: SearchArea, cx: &mut Context<Workbench>) {
    let (input, max, page, endpoint) = match area {
        SearchArea::Marketplace => ("mcp-market-query", 256, ConnectionsPage::Tools, MARKET),
        SearchArea::Registry => ("registry-search", 128, ConnectionsPage::Registry, REGISTRY),
    };
    let query = value(this, input, cx);
    let query = query.trim();
    if query.is_empty() || query.encode_utf16().count() > max || query.chars().any(char::is_control)
    {
        this.connections
            .set_feedback(page, "Enter a search term to continue.");
        cx.notify();
        return;
    }
    let path = match area {
        SearchArea::Marketplace => query_route(endpoint, &[("query", query), ("limit", "12")]),
        SearchArea::Registry => query_route(endpoint, &[("query", query)]),
    };
    match area {
        SearchArea::Marketplace => {
            this.connections.catalog.marketplace_query = Some(path.clone());
            this.connections.catalog.marketplace_detail = None;
        }
        SearchArea::Registry => this.connections.catalog.registry_query = Some(path.clone()),
    }
    this.connections.feedback.remove(&page);
    this.control_get(&path, cx);
}

fn query_route(path: &str, params: &[(&str, &str)]) -> String {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(params.iter().copied())
        .finish();
    format!("{path}?{query}")
}

#[cfg(test)]
mod tests {
    #[test]
    fn search_keeps_route_separators_inside_the_query_value() {
        let path = super::query_route(
            "/runtime/registry",
            &[("query", "hello&refresh=true #test")],
        );
        assert_eq!(
            path,
            "/runtime/registry?query=hello%26refresh%3Dtrue+%23test"
        );
    }
}
