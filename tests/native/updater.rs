use super::mac::{valid_update_metadata, verify_signature};
use std::{fs, process::Command};

const TEST_PUBLIC_KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

#[test]
fn requires_https_and_a_canonical_ed25519_public_key() {
    assert!(valid_update_metadata(
        "https://updates.example.org/doolittle/appcast.xml",
        TEST_PUBLIC_KEY
    ));
    for feed in [
        "http://updates.example.org/appcast.xml",
        "file:///tmp/appcast.xml",
        "https://user:pass@updates.example.org/appcast.xml",
        "https://updates.example.org/appcast.xml#fragment",
        "https://updates.example.org/appcast.xml\n",
    ] {
        assert!(!valid_update_metadata(feed, TEST_PUBLIC_KEY));
    }
    for key in ["", "AAAA", TEST_PUBLIC_KEY.trim_end_matches('=')] {
        assert!(!valid_update_metadata(
            "https://updates.example.org/appcast.xml",
            key
        ));
    }
}

#[test]
fn rejects_an_ad_hoc_signed_app_with_the_release_identifier() {
    let temporary = tempfile::tempdir().unwrap();
    let app = temporary.path().join("Doolittle.app");
    let contents = app.join("Contents");
    fs::create_dir_all(contents.join("MacOS")).unwrap();
    fs::copy("/usr/bin/true", contents.join("MacOS/Doolittle")).unwrap();
    fs::write(
        contents.join("Info.plist"),
        r#"<?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0"><dict>
          <key>CFBundleIdentifier</key><string>ai.doolittle.desktop</string>
          <key>CFBundleExecutable</key><string>Doolittle</string>
          <key>CFBundlePackageType</key><string>APPL</string>
        </dict></plist>"#,
    )
    .unwrap();
    assert!(
        Command::new("/usr/bin/codesign")
            .args(["--force", "--sign", "-"])
            .arg(&app)
            .output()
            .unwrap()
            .status
            .success()
    );
    assert!(
        Command::new("/usr/bin/codesign")
            .args(["--verify", "--deep", "--strict"])
            .arg(&app)
            .status()
            .unwrap()
            .success()
    );
    assert!(!verify_signature(&app));
}
