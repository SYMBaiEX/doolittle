use std::{fs, path::Path};

use anyhow::Result;
use doolittle_host::{RuntimeSidecar, SidecarConfig};
use tempfile::TempDir;

fn fixture(source: &str) -> Result<(TempDir, SidecarConfig)> {
    let root = tempfile::tempdir()?;
    let path = root.path();
    let workspace = path.join("workspace");
    let profile = path.join("profile");
    let runtime = path.join("runtime");
    fs::create_dir_all(&workspace)?;
    fs::create_dir_all(&runtime)?;
    fs::write(runtime.join("doolittle-runtime.mjs"), source)?;
    let config = SidecarConfig::discover(&workspace, Some(&profile), Some(&runtime), true)?;
    Ok((root, config))
}

#[test]
fn locks_the_profile_and_closes_the_runtime_input_on_shutdown() -> Result<()> {
    let (root, config) = fixture(
        r#"
import fs from 'node:fs';
if (!/^[0-9a-f]{64}$/.test(process.env.ELIZA_API_TOKEN)) process.exit(10);
if (process.env.ELIZA_API_BIND !== '127.0.0.1' || process.env.ELIZA_API_PORT !== '0') process.exit(11);
if (process.argv[2] !== 'native-api') process.exit(12);
if (process.env.DOOLITTLE_NATIVE_MIGRATE_LEGACY !== '0') process.exit(13);
console.log('x'.repeat(10_000));
console.log('DOOLITTLE_NATIVE_READY {"url":"http://127.0.0.1:32123"}');
process.stdin.resume();
process.stdin.once('end', () => {
  fs.writeFileSync(process.env.DOOLITTLE_DATA_DIR + '/closed', 'yes');
});
"#,
    )?;
    let runtime = RuntimeSidecar::launch(&config)?;
    assert_eq!(runtime.endpoint(), "http://127.0.0.1:32123");
    assert_eq!(runtime.token().len(), 64);
    assert!(runtime.profile_migration().is_none());
    assert!(RuntimeSidecar::launch(&config).is_err());
    drop(runtime);
    assert_eq!(
        fs::read_to_string(root.path().join("profile/closed"))?,
        "yes"
    );
    Ok(())
}

#[test]
fn reads_legacy_migration_counts_from_the_ready_record() -> Result<()> {
    let (_root, config) = fixture(
        r#"console.log('DOOLITTLE_NATIVE_READY {"url":"http://127.0.0.1:32123","migration":{"importedConversations":2,"skippedConversations":1,"settingsImported":true,"deferred":true}}'); process.stdin.resume();"#,
    )?;
    let runtime = RuntimeSidecar::launch(&config)?;
    let migration = runtime.profile_migration().expect("migration report");
    assert_eq!(migration.imported_conversations, 2);
    assert_eq!(migration.skipped_conversations, 1);
    assert!(migration.settings_imported);
    assert!(migration.deferred);
    Ok(())
}

#[test]
fn refuses_runtime_readiness_with_a_non_loopback_url() -> Result<()> {
    let (_root, config) =
        fixture(r#"console.log('DOOLITTLE_NATIVE_READY {"url":"https://example.net:443/"}');"#)?;
    let error = RuntimeSidecar::launch(&config)
        .err()
        .expect("remote endpoint was rejected");
    assert!(error.to_string().contains("private loopback"));
    Ok(())
}

#[test]
fn rejects_a_file_as_the_workspace() -> Result<()> {
    let root = tempfile::tempdir()?;
    let workspace = root.path().join("file");
    fs::write(&workspace, "")?;
    let result = SidecarConfig::discover(&workspace, Some(Path::new("unused")), None, false);
    assert!(
        result
            .err()
            .expect("workspace rejected")
            .to_string()
            .contains("must be a directory")
    );
    Ok(())
}
