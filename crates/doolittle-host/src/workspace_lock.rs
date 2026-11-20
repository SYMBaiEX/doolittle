use std::{fs::DirBuilder, fs::File, path::Path};

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

pub(crate) struct WorkspaceLock {
    _files: Vec<File>,
}

pub(crate) fn workspace_key(workspace: &Path) -> String {
    format!(
        "{:x}",
        Sha256::digest(workspace.as_os_str().as_encoded_bytes())
    )
}

fn lock_key(directory: &Path) -> Result<String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        let identity = directory.metadata()?;
        Ok(format!("{:x}-{:x}", identity.dev(), identity.ino()))
    }
    #[cfg(not(unix))]
    {
        Ok(workspace_key(directory))
    }
}

impl WorkspaceLock {
    pub(crate) fn acquire(lock_directory: &Path, workspace: &Path) -> Result<Self> {
        let mut builder = DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt as _;
            builder.mode(0o700);
        }
        builder.create(lock_directory)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt as _;
            let metadata = lock_directory.symlink_metadata()?;
            // SAFETY: geteuid reads the uid of the current process.
            let owner = unsafe { nix::libc::geteuid() };
            anyhow::ensure!(
                metadata.is_dir() && metadata.uid() == owner && metadata.mode() & 0o077 == 0,
                "The native workspace lock directory must be private to the current user"
            );
        }

        let mut files = Vec::new();
        // Shared ancestor locks let siblings run concurrently. An exclusive lock
        // conflicts with every runtime rooted at, inside, or above this directory.
        let ancestors: Vec<_> = workspace.ancestors().collect();
        for directory in ancestors.into_iter().rev() {
            let mut options = File::options();
            options.read(true).write(true).create(true).truncate(false);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt as _;
                options.mode(0o600).custom_flags(nix::libc::O_NOFOLLOW);
            }
            let lock = options.open(lock_directory.join(lock_key(directory)?))?;
            let result = if directory == workspace {
                lock.try_lock()
            } else {
                lock.try_lock_shared()
            };
            result.context("An overlapping workspace is already open or cannot be locked")?;
            files.push(lock);
        }
        Ok(Self { _files: files })
    }

    #[cfg(unix)]
    pub(crate) fn keep_in_child(&self, command: &mut std::process::Command, profile: &File) {
        use std::{io, os::fd::AsRawFd as _, os::unix::process::CommandExt as _};

        let descriptors: Vec<_> = self
            ._files
            .iter()
            .chain(std::iter::once(profile))
            .map(File::as_raw_fd)
            .collect();
        // SAFETY: only async-signal-safe system calls run after fork. The
        // descriptors are open until spawn and remain close-on-exec in the parent.
        unsafe {
            command.pre_exec(move || {
                for &fd in &descriptors {
                    let flags = nix::libc::fcntl(fd, nix::libc::F_GETFD);
                    if flags == -1
                        || nix::libc::fcntl(fd, nix::libc::F_SETFD, flags & !nix::libc::FD_CLOEXEC)
                            == -1
                    {
                        return Err(io::Error::last_os_error());
                    }
                }
                Ok(())
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The subprocess fixture temporarily inherits descriptors across fork.
    static WORKSPACE_TESTS: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn sibling_workspaces_can_open_but_overlapping_workspaces_are_exclusive() -> Result<()> {
        let _serial = WORKSPACE_TESTS.lock().unwrap();
        let root = tempfile::tempdir()?;
        let locks = root.path().join("locks");
        let workspace = root.path().join("work");
        let left = workspace.join("left");
        let right = workspace.join("right");
        let nested = left.join("nested");
        std::fs::create_dir_all(&nested)?;
        std::fs::create_dir_all(&right)?;

        let left_lock = WorkspaceLock::acquire(&locks, &left)?;
        let right_lock = WorkspaceLock::acquire(&locks, &right)?;
        assert!(WorkspaceLock::acquire(&locks, &left).is_err());
        assert!(WorkspaceLock::acquire(&locks, &workspace).is_err());
        assert!(WorkspaceLock::acquire(&locks, &nested).is_err());
        drop((left_lock, right_lock));

        let nested_lock = WorkspaceLock::acquire(&locks, &nested)?;
        assert!(WorkspaceLock::acquire(&locks, &left).is_err());
        drop(nested_lock);
        WorkspaceLock::acquire(&locks, &workspace)?;
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn workspace_stays_locked_until_the_child_exits() -> Result<()> {
        use std::process::{Command, Stdio};

        let _serial = WORKSPACE_TESTS.lock().unwrap();
        let root = tempfile::tempdir()?;
        let locks = root.path().join("locks");
        let profile = File::create(root.path().join("profile.lock"))?;
        let workspace = root.path().join("workspace");
        std::fs::create_dir(&workspace)?;
        let parent_lock = WorkspaceLock::acquire(&locks, &workspace)?;
        let mut command = Command::new("/bin/cat");
        command.stdin(Stdio::piped()).stdout(Stdio::null());
        parent_lock.keep_in_child(&mut command, &profile);
        let mut child = command.spawn()?;
        drop(parent_lock);
        let protected = WorkspaceLock::acquire(&locks, &workspace).is_err();
        assert!(child.wait()?.success());
        assert!(protected);
        WorkspaceLock::acquire(&locks, &workspace)?;
        Ok(())
    }
}
