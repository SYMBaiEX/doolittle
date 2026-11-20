use super::prepare_personal_workspace;

#[test]
fn creates_and_reopens_only_the_selected_directory() -> anyhow::Result<()> {
    let root = tempfile::tempdir()?;
    let path = root.path().join("Personal");
    let workspace = prepare_personal_workspace(path.clone())?;
    assert_eq!(workspace, path.canonicalize()?);
    assert_eq!(prepare_personal_workspace(path)?, workspace);
    Ok(())
}

#[cfg(unix)]
#[test]
fn rejects_redirects_and_shared_permissions() -> anyhow::Result<()> {
    use std::os::unix::fs::{PermissionsExt, symlink};

    let root = tempfile::tempdir()?;
    let shared = root.path().join("shared");
    std::fs::create_dir(&shared)?;
    std::fs::set_permissions(&shared, std::fs::Permissions::from_mode(0o755))?;
    let redirect = root.path().join("redirect");
    symlink(&shared, &redirect)?;
    assert!(prepare_personal_workspace(redirect).is_err());
    assert!(prepare_personal_workspace(shared).is_err());
    Ok(())
}
