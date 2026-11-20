use std::fmt::Write as _;

use anyhow::{Context, Result, bail, ensure};
use clap::Subcommand;
use doolittle_runtime::{ControlMethod, RuntimeClient};
use serde_json::{Value, json};

use crate::{print_json, terminal_text};

#[derive(Subcommand)]
pub(crate) enum ApprovalCommand {
    /// Record the operator's approval for one pending execution
    Approve { id: String },
    /// Deny one pending execution
    Deny { id: String },
}

impl ApprovalCommand {
    pub(crate) fn execute(self, client: &RuntimeClient) -> Result<Value> {
        let (id, decision) = match self {
            Self::Approve { id } => (id, "approve"),
            Self::Deny { id } => (id, "deny"),
        };
        approval(client, &id, decision)
    }
}

pub(crate) fn approval(client: &RuntimeClient, id: &str, decision: &str) -> Result<Value> {
    let id = route_id(id)?;
    client
        .control(
            ControlMethod::Post,
            &format!("/execution/approvals/{id}/{decision}"),
            None,
        )
        .map_err(Into::into)
}

#[derive(Subcommand)]
pub(crate) enum AutomationCommand {
    /// List configured automations
    List,
    /// Show recent automation runs
    Runs,
    /// Schedule a prompt with the ElizaOS automation service
    Create {
        #[arg(long)]
        name: String,
        #[arg(long)]
        schedule: String,
        #[arg(short = 'p', long)]
        prompt: String,
    },
    /// Pause an automation
    Pause { id: String },
    /// Resume an automation
    Resume { id: String },
    /// Run an automation once
    Run { id: String },
    /// Remove an automation
    Delete { id: String },
}

impl AutomationCommand {
    pub(crate) fn execute(self, client: &RuntimeClient, json: bool) -> Result<()> {
        let (method, path, body, title, field) = match self {
            Self::List => (
                ControlMethod::Get,
                "/cron/jobs".into(),
                None,
                "Automations",
                "jobs",
            ),
            Self::Runs => (
                ControlMethod::Get,
                "/cron/runs".into(),
                None,
                "Automation runs",
                "runs",
            ),
            Self::Create {
                name,
                schedule,
                prompt,
            } => {
                let prompt = crate::checked_prompt(prompt)?;
                ensure!(
                    !name.trim().is_empty() && !schedule.trim().is_empty(),
                    "A name and schedule are required"
                );
                (
                    ControlMethod::Post,
                    "/cron/jobs".into(),
                    Some(json!({"name": name, "schedule": schedule, "prompt": prompt})),
                    "Created automation",
                    "job",
                )
            }
            Self::Pause { id } => automation_action(id, "pause", "Paused automation")?,
            Self::Resume { id } => automation_action(id, "resume", "Resumed automation")?,
            Self::Run { id } => automation_action(id, "run", "Automation run requested")?,
            Self::Delete { id } => (
                ControlMethod::Delete,
                format!("/cron/jobs/{}", route_id(&id)?),
                None,
                "Removed automation",
                "id",
            ),
        };
        let response = client.control(method, &path, body.as_ref())?;
        present(&response, json, title, Some(field))
    }
}

fn automation_action(
    id: String,
    action: &str,
    title: &'static str,
) -> Result<(
    ControlMethod,
    String,
    Option<Value>,
    &'static str,
    &'static str,
)> {
    Ok((
        ControlMethod::Post,
        format!("/cron/jobs/{}/{action}", route_id(&id)?),
        None,
        title,
        "job",
    ))
}

pub(crate) fn inspect(
    client: &RuntimeClient,
    command: &str,
    args: &[String],
    json: bool,
) -> Result<()> {
    let value = args.join(" ");
    let (action, remainder) = value.split_once(' ').unwrap_or((&value, ""));
    let (path, heading, field) = match (command, action) {
        ("status", "") => ("/runtime/status".into(), "Runtime status", None),
        ("progress", "") => ("/chat/runs?limit=15".into(), "Recent runs", Some("runs")),
        ("progress", "all") => (
            "/chat/runs?limit=100&include_updates=true".into(),
            "Recent runs",
            None,
        ),
        ("tools", "" | "summary") => ("/tools/summary".into(), "Tool summary", Some("summary")),
        ("tools", "list") => ("/tools".into(), "Tools", Some("tools")),
        ("tools", "search") => (
            query("/tools/search", "query", remainder)?,
            "Tool results",
            Some("results"),
        ),
        ("tools", "category") => (
            query("/tools/category", "name", remainder)?,
            "Tools",
            Some("tools"),
        ),
        ("tools", "detail" | "show") => (
            query("/tools/detail", "id", remainder)?,
            "Tool",
            Some("tool"),
        ),
        ("tools", "transports") => (
            "/tools/transports".into(),
            "Tool transports",
            Some("transports"),
        ),
        ("skills", "" | "list") => ("/skills".into(), "Skills", Some("skills")),
        ("skills", "installed") => (
            "/skills/installed".into(),
            "Installed skills",
            Some("installed"),
        ),
        ("skills", "generated") if remainder.is_empty() => (
            "/skills/generated".into(),
            "Generated skills",
            Some("skills"),
        ),
        ("skills", "generated") => (
            query("/skills/generated/detail", "slug", remainder)?,
            "Generated skill",
            Some("detail"),
        ),
        ("skills", "catalog") if remainder.is_empty() => {
            ("/skills/catalog".into(), "Skill catalog", None)
        }
        ("skills", "catalog" | "search") => (
            query("/skills/catalog", "query", remainder)?,
            "Skill catalog",
            None,
        ),
        ("runtime", "" | "status") => ("/runtime/status".into(), "Runtime status", None),
        ("runtime", "transports") => ("/runtime/transports".into(), "Runtime transports", None),
        ("runtime", "plugins") => (
            "/runtime/plugins?view=catalog".into(),
            "Runtime plugins",
            Some("catalog"),
        ),
        ("runtime", "compatibility") => (
            "/runtime/compatibility".into(),
            "Runtime compatibility",
            None,
        ),
        ("runtime", "registry") => ("/runtime/registry".into(), "Runtime registry", None),
        ("runtime", "ecosystem") => ("/runtime/ecosystem".into(), "Runtime ecosystem", None),
        ("runtime", "autonomous") => ("/runtime/autonomous".into(), "Autonomous runtime", None),
        ("runtime", "models") | ("models", "") => ("/runtime/models".into(), "Models", None),
        ("runtime", "accounts") | ("accounts", "" | "list") => {
            ("/runtime/accounts".into(), "Linked accounts", None)
        }
        ("doctor", "" | "check") => ("/doctor".into(), "Readiness", Some("checks")),
        ("setup", "") => ("/setup/summary".into(), "Setup", Some("summary")),
        ("setup", "checklist" | "check") => (
            "/setup/checklist".into(),
            "Setup checklist",
            Some("checklist"),
        ),
        ("theme", "" | "list") => ("/theme".into(), "Terminal themes", None),
        ("execution", "" | "status") => ("/execution/status".into(), "Execution", None),
        ("gateway", "" | "health" | "readiness") => {
            ("/gateway/health".into(), "Gateway health", None)
        }
        ("gateway", "runtime") => ("/gateway/runtime".into(), "Gateway runtime", None),
        ("activity", "") => ("/activity".into(), "Activity", None),
        ("commands", _) => return commands(client, &value, json),
        _ => bail!("Unsupported {command} view. Run `doolittle-native {command} --help`."),
    };
    let response = client.get_json(&path, None)?;
    if !json && (command == "status" || command == "runtime" && matches!(action, "" | "status")) {
        if let Some(model) = response.get("model").and_then(Value::as_str) {
            println!("Model     {}", one_line(model));
        }
        if let Some(provider) = response.get("provider").and_then(Value::as_str) {
            println!("Provider  {}", one_line(provider));
        }
        if let Some(startup) = response.get("startup") {
            return present(startup, false, "Startup", None);
        }
    }
    present(&response, json, heading, field)
}

fn commands(client: &RuntimeClient, filter: &str, as_json: bool) -> Result<()> {
    let payload = client.get_json("/commands/catalog", None)?;
    let entries = payload
        .get("commands")
        .and_then(Value::as_array)
        .context("Runtime command catalog is malformed")?;
    let filter = filter.to_lowercase();
    let matches: Vec<_> = entries
        .iter()
        .filter(|entry| {
            filter.is_empty()
                || ["command", "description", "label", "category"]
                    .iter()
                    .any(|field| {
                        entry
                            .get(field)
                            .and_then(Value::as_str)
                            .is_some_and(|value| value.to_lowercase().contains(&filter))
                    })
        })
        .collect();
    if as_json {
        return print_json(&json!({"commands": matches}));
    }
    if matches.is_empty() {
        println!("No matching commands.");
    }
    for entry in matches {
        let command = entry
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let detail = entry
            .get("description")
            .or_else(|| entry.get("summary"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        println!("{:<27}{}", one_line(command), one_line(detail));
    }
    Ok(())
}

pub(crate) fn select_model(
    client: &RuntimeClient,
    provider: String,
    model: String,
    as_json: bool,
) -> Result<()> {
    ensure!(
        !provider.trim().is_empty() && !model.trim().is_empty(),
        "Provider and model are required"
    );
    let saved = client.control(
        ControlMethod::Post,
        "/settings",
        Some(&json!({"changes": [
            {"path": "model.provider", "value": provider},
            {"path": "model.model", "value": model}
        ]})),
    )?;
    let selection = saved
        .pointer("/settings/model")
        .context("Runtime model settings response is malformed")?;
    present(selection, as_json, "Model route", None)
}

pub(crate) fn theme(client: &RuntimeClient, action: &str, as_json: bool) -> Result<()> {
    let value = match action {
        "" | "list" => client.get_json("/theme", None)?,
        "next" => client.control(ControlMethod::Post, "/theme/next", None)?,
        "prev" | "previous" => client.control(ControlMethod::Post, "/theme/prev", None)?,
        _ => {
            let name = action.strip_prefix("set ").unwrap_or(action);
            client.control(ControlMethod::Post, "/theme", Some(&json!({"theme": name})))?
        }
    };
    present(&value, as_json, "Terminal theme", None)
}

pub(crate) fn present(
    value: &Value,
    as_json: bool,
    title: &str,
    field: Option<&str>,
) -> Result<()> {
    if as_json {
        return print_json(value);
    }
    println!("{title}");
    let visible = field.and_then(|field| value.get(field)).unwrap_or(value);
    if let Some(items) = visible.as_array().filter(|_| field.is_some()) {
        if items.is_empty() {
            println!("  None.");
        }
        for item in items {
            let label = [
                "name", "label", "title", "command", "jobId", "runId", "slug", "id",
            ]
            .iter()
            .find_map(|key| item.get(key).and_then(Value::as_str));
            let status = [
                "status",
                "activeAction",
                "description",
                "reason",
                "schedule",
            ]
            .iter()
            .find_map(|key| item.get(key).and_then(Value::as_str));
            if let Some(label) = label {
                print!("  {}", one_line(label));
                if let Some(status) = status {
                    print!("  {}", one_line(status));
                }
                println!();
            } else {
                println!("  {}", one_line(&item.to_string()));
            }
        }
    } else {
        println!("{}", terminal_text(&serde_json::to_string_pretty(visible)?));
    }
    Ok(())
}

fn query(path: &str, key: &str, value: &str) -> Result<String> {
    ensure!(
        !value.trim().is_empty() && value.len() <= 1024,
        "A search value of up to 1024 bytes is required"
    );
    let mut url = format!("{path}?{key}=");
    for unit in value.bytes() {
        if unit.is_ascii_alphanumeric() || matches!(unit, b'-' | b'_' | b'.' | b'~') {
            url.push(char::from(unit));
        } else {
            write!(url, "%{unit:02X}")?;
        }
    }
    Ok(url)
}

fn route_id(id: &str) -> Result<&str> {
    ensure!(
        id.len() <= 128
            && id.as_bytes().first().is_some_and(u8::is_ascii_alphanumeric)
            && id
                .bytes()
                .all(|unit| unit.is_ascii_alphanumeric()
                    || matches!(unit, b'-' | b'_' | b'.' | b':')),
        "Invalid record ID"
    );
    Ok(id)
}

pub(crate) fn one_line(text: &str) -> String {
    terminal_text(text).replace(['\n', '\t'], " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operator_queries_and_ids_cannot_change_the_route() {
        assert_eq!(
            query("/tools/search", "query", "a &/? é").unwrap(),
            "/tools/search?query=a%20%26%2F%3F%20%C3%A9"
        );
        assert!(query("/tools/search", "query", "").is_err());
        assert!(route_id("test:do_2.1").is_ok());
        for id in [
            ".",
            "..",
            "../other",
            "first/second",
            "first%2Fsecond",
            "first?second",
            "foo\\bar",
        ] {
            assert!(route_id(id).is_err());
        }
    }
}
