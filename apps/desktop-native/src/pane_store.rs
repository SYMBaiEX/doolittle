use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{self, Read as _, Write as _},
    path::Path,
};

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::panes::{PRIMARY_PANE, PaneId, PaneLayout};

const FILE_NAME: &str = "conversation-panes.json";
const MAX_BYTES: u64 = 64 * 1024;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PaneSession {
    pub(crate) session: String,
    pub(crate) agent: Option<PaneAgent>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PaneAgent {
    pub(crate) id: String,
    pub(crate) name: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PaneSnapshot {
    version: u8,
    pub(crate) layout: PaneLayout,
    pub(crate) sessions: BTreeMap<PaneId, PaneSession>,
}

impl PaneSnapshot {
    pub(crate) fn new(layout: PaneLayout, sessions: BTreeMap<PaneId, PaneSession>) -> Self {
        Self {
            version: 1,
            layout,
            sessions,
        }
    }

    fn validate(&self) -> bool {
        self.version == 1
            && self
                .layout
                .persisted_panes()
                .is_some_and(|panes| panes.into_iter().eq(self.sessions.keys().copied()))
            && self
                .sessions
                .get(&PRIMARY_PANE)
                .is_some_and(|pane| pane.agent.is_none())
            && self.sessions.values().all(|pane| {
                !pane.session.is_empty()
                    && pane.session.len() <= 128
                    && pane
                        .session
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b":_-".contains(&byte))
                    && pane.agent.as_ref().is_none_or(|agent| {
                        Uuid::parse_str(&agent.id)
                            .is_ok_and(|id| !id.is_nil() && id.to_string() == agent.id)
                            && !agent.name.trim().is_empty()
                            && agent.name.len() <= 640
                            && !agent.name.chars().any(char::is_control)
                    })
            })
    }
}

pub(crate) fn load(profile: &Path) -> Result<Option<PaneSnapshot>> {
    let path = profile.join(FILE_NAME);
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        result => {
            let metadata = result?;
            ensure!(
                metadata.is_file() && metadata.len() <= MAX_BYTES,
                "Invalid pane layout file"
            );
        }
    }
    let file = File::open(path)?;
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    ensure!(bytes.len() as u64 <= MAX_BYTES, "Pane layout is too large");
    let snapshot: PaneSnapshot = serde_json::from_slice(&bytes)?;
    ensure!(snapshot.validate(), "Invalid pane layout state");
    Ok(Some(snapshot))
}

pub(crate) fn save(profile: &Path, snapshot: &PaneSnapshot) -> Result<()> {
    ensure!(snapshot.validate(), "Invalid pane layout state");
    let bytes = serde_json::to_vec(snapshot)?;
    ensure!(bytes.len() as u64 <= MAX_BYTES, "Pane layout is too large");
    let temporary = profile.join(format!(".conversation-panes-{}.tmp", Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    let result = (|| {
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, profile.join(FILE_NAME))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::panes::SplitDirection;

    fn session() -> PaneSession {
        PaneSession {
            session: Uuid::new_v4().to_string(),
            agent: None,
        }
    }

    #[test]
    fn restores_open_and_closed_pane_sessions_and_split_sizes() -> Result<()> {
        let profile = tempfile::tempdir()?;
        let mut layout = PaneLayout::default();
        let secondary = layout.split(PRIMARY_PANE, SplitDirection::Right).unwrap();
        assert!(layout.resize(1, [450.0, 600.0]));
        assert!(layout.close(secondary));
        let agent = PaneAgent {
            id: Uuid::new_v4().to_string(),
            name: "Review agent".into(),
        };
        let transcript = session();
        let expected = transcript.session.clone();
        let original = PaneSnapshot::new(
            layout,
            BTreeMap::from([
                (PRIMARY_PANE, session()),
                (
                    secondary,
                    PaneSession {
                        agent: Some(agent),
                        ..transcript
                    },
                ),
            ]),
        );
        save(profile.path(), &original)?;
        let mut saved = load(profile.path())?.unwrap();
        assert_eq!(saved.layout.reopen(), Some(secondary));
        assert!(!saved.layout.resize(1, [450.0, 600.0]));
        assert_eq!(saved.sessions[&secondary].session, expected);
        assert_eq!(
            saved.sessions[&secondary].agent.as_ref().unwrap().name,
            "Review agent"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            let mode = fs::metadata(profile.path().join(FILE_NAME))?
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        Ok(())
    }

    #[test]
    fn rejects_invalid_state_without_changing_existing_file() -> Result<()> {
        let profile = tempfile::tempdir()?;
        let path = profile.path().join(FILE_NAME);
        fs::write(&path, b"bad state")?;
        assert!(load(profile.path()).is_err());
        let bad = PaneSnapshot::new(PaneLayout::default(), BTreeMap::new());
        assert!(save(profile.path(), &bad).is_err());
        assert_eq!(fs::read(path)?, b"bad state");
        Ok(())
    }
}
