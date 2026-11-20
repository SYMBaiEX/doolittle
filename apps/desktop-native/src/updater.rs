#[cfg(not(target_os = "macos"))]
use gpui::App;

#[cfg(target_os = "macos")]
pub(crate) use mac::{check_for_updates, initialize, quit, status};

#[cfg(not(target_os = "macos"))]
pub(crate) fn initialize(_: &mut App, _: fn(&mut App)) {}

#[cfg(not(target_os = "macos"))]
pub(crate) fn quit(cx: &App) {
    cx.quit();
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn check_for_updates(_: &mut App) {}

#[cfg(not(target_os = "macos"))]
pub(crate) fn status(_: &App) -> (&'static str, bool) {
    ("Install updates from Releases.", false)
}

#[cfg(target_os = "macos")]
mod mac {
    use std::{
        cell::{Cell, RefCell},
        path::{Path, PathBuf},
        process::{Command, Stdio},
        ptr,
    };

    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use gpui::{App, AsyncApp, Global};
    use objc2::{
        class, msg_send,
        rc::{Allocated, Retained},
        runtime::{AnyClass, AnyObject, ClassBuilder, Imp, Sel},
        sel,
    };
    use objc2_foundation::NSString;
    use url::Url;

    const RELEASE_REQUIREMENT: &str = concat!(
        "=anchor apple generic and identifier \"ai.doolittle.desktop\"",
        " and certificate 1[field.1.2.840.113635.100.6.2.6] exists",
        " and certificate leaf[field.1.2.840.113635.100.6.1.13] exists",
        " and certificate leaf[subject.OU] = \"3VZKJ253J2\"",
    );

    enum State {
        Unavailable,
        Verifying,
        Available(Sparkle),
    }

    impl Global for State {}

    struct Sparkle {
        controller: Retained<AnyObject>,
        _feed_delegate: Retained<AnyObject>,
    }

    type QuitHandler = (AsyncApp, fn(&mut App));

    thread_local! {
        static QUIT_HANDLER: RefCell<Option<QuitHandler>> = const { RefCell::new(None) };
        static ALLOW_QUIT: Cell<bool> = const { Cell::new(false) };
        static QUIT_PENDING: Cell<bool> = const { Cell::new(false) };
        static FEED: RefCell<Option<Retained<NSString>>> = const { RefCell::new(None) };
    }

    pub(crate) fn initialize(cx: &mut App, request_quit: fn(&mut App)) {
        cx.set_global(State::Unavailable);
        let Some((bundle, feed)) = release_bundle() else {
            return;
        };
        cx.set_global(State::Verifying);
        let signature = cx
            .background_executor()
            .spawn(async move { verify_signature(&bundle).then_some(bundle) });
        cx.spawn(async move |cx| {
            let verified = signature.await;
            let _ = cx.update(|app| {
                let state = verified
                    .and_then(|bundle| start_updater(&bundle, &feed, app, request_quit))
                    .map_or(State::Unavailable, State::Available);
                app.set_global(state);
                app.refresh_windows();
            });
        })
        .detach();
    }

    pub(crate) fn quit(cx: &App) {
        ALLOW_QUIT.set(true);
        cx.quit();
    }

    pub(crate) fn status(cx: &App) -> (&'static str, bool) {
        match cx.try_global::<State>() {
            Some(State::Available(_)) => ("Signed release updates", true),
            Some(State::Verifying) => ("Verifying this installation…", false),
            _ => ("Install updates from Releases.", false),
        }
    }

    pub(crate) fn check_for_updates(cx: &mut App) {
        let Some(State::Available(sparkle)) = cx.try_global::<State>() else {
            return;
        };
        unsafe {
            let () = msg_send![
                &*sparkle.controller,
                checkForUpdates: ptr::null_mut::<AnyObject>(),
            ];
        }
    }

    fn release_bundle() -> Option<(PathBuf, String)> {
        let executable = std::env::current_exe().ok()?.canonicalize().ok()?;
        let bundle = executable.parent()?.parent()?.parent()?;
        if executable != bundle.join("Contents/MacOS/Doolittle")
            || bundle.extension()? != "app"
            || !bundle
                .join("Contents/Frameworks/Sparkle.framework")
                .is_dir()
        {
            return None;
        }
        let main_bundle: Retained<AnyObject> = unsafe { msg_send![class!(NSBundle), mainBundle] };
        let identifier: Option<Retained<NSString>> =
            unsafe { msg_send![&*main_bundle, bundleIdentifier] };
        if identifier?.to_string() != "ai.doolittle.desktop"
            || number_setting(&main_bundle, "SURequireSignedFeed") != Some(1)
            || number_setting(&main_bundle, "SUVerifyUpdateBeforeExtraction") != Some(1)
            || number_setting(&main_bundle, "SUSignedFeedFailureExpirationInterval") != Some(0)
            || number_setting(&main_bundle, "SUEnableAutomaticChecks") != Some(0)
            || number_setting(&main_bundle, "SUAllowsAutomaticUpdates") != Some(0)
            || number_setting(&main_bundle, "SUAutomaticallyUpdate") != Some(0)
        {
            return None;
        }
        let feed = string_setting(&main_bundle, "SUFeedURL")?;
        let key = string_setting(&main_bundle, "SUPublicEDKey")?;
        valid_update_metadata(&feed, &key).then(|| (bundle.to_owned(), feed))
    }

    pub(super) fn valid_update_metadata(feed: &str, key: &str) -> bool {
        feed.starts_with("https://")
            && feed == feed.trim()
            && !feed.contains(['\n', '\r', '\t'])
            && Url::parse(feed).is_ok_and(|url| {
                url.scheme() == "https"
                    && url.host_str().is_some()
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url.fragment().is_none()
            })
            && STANDARD
                .decode(key)
                .is_ok_and(|bytes| bytes.len() == 32 && STANDARD.encode(bytes) == key)
    }

    fn setting(bundle: &AnyObject, key: &str) -> Option<Retained<AnyObject>> {
        let key = NSString::from_str(key);
        unsafe { msg_send![bundle, objectForInfoDictionaryKey: &*key] }
    }

    fn string_setting(bundle: &AnyObject, key: &str) -> Option<String> {
        Some(
            setting(bundle, key)?
                .downcast::<NSString>()
                .ok()?
                .to_string(),
        )
    }

    fn number_setting(bundle: &AnyObject, key: &str) -> Option<i64> {
        let setting = setting(bundle, key)?;
        let is_number: bool = unsafe { msg_send![&*setting, isKindOfClass: class!(NSNumber)] };
        is_number.then(|| unsafe { msg_send![&*setting, longLongValue] })
    }

    pub(super) fn verify_signature(bundle: &Path) -> bool {
        let verify = |args: &[&str]| {
            Command::new("/usr/bin/codesign")
                .env_clear()
                .args(args)
                .arg(bundle)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok_and(|status| status.success())
        };
        verify(&["--verify", "--strict", "-R", RELEASE_REQUIREMENT])
            && verify(&["--verify", "--deep", "--strict"])
    }

    fn start_updater(
        bundle: &Path,
        feed: &str,
        cx: &App,
        request_quit: fn(&mut App),
    ) -> Option<Sparkle> {
        let framework_path = bundle.join("Contents/Frameworks/Sparkle.framework");
        let framework_path = NSString::from_str(framework_path.to_str()?);
        let framework: Retained<AnyObject> = unsafe {
            let framework: Option<Retained<AnyObject>> =
                msg_send![class!(NSBundle), bundleWithPath: &*framework_path];
            framework?
        };
        let loaded: bool = unsafe { msg_send![&*framework, load] };
        if !loaded {
            return None;
        }

        // The signed bundle feed takes precedence over preferences and command-line overrides.
        let mut builder = ClassBuilder::new(c"DoolittleSparkleFeedDelegate", class!(NSObject))?;
        unsafe {
            builder.add_method(
                sel!(feedURLStringForUpdater:),
                signed_feed
                    as extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> *const NSString,
            );
        }
        let delegate_class = builder.register();
        let delegate: Retained<AnyObject> = unsafe { msg_send![delegate_class, new] };
        FEED.with_borrow_mut(|value| *value = Some(NSString::from_str(feed)));

        let controller_class = AnyClass::get(c"SPUStandardUpdaterController")?;
        let controller: Retained<AnyObject> = unsafe {
            let allocated: Allocated<AnyObject> = msg_send![controller_class, alloc];
            let controller: Option<Retained<AnyObject>> = msg_send![
                allocated,
                initWithStartingUpdater: false,
                updaterDelegate: &*delegate,
                userDriverDelegate: ptr::null_mut::<AnyObject>(),
            ];
            controller?
        };
        install_quit_guard(cx, request_quit)?;
        let started: bool = unsafe {
            let updater: Retained<AnyObject> = msg_send![&*controller, updater];
            let () = msg_send![&*updater, setAutomaticallyChecksForUpdates: false];
            msg_send![&*updater, startUpdater: ptr::null_mut::<*mut AnyObject>()]
        };
        started.then_some(Sparkle {
            controller,
            _feed_delegate: delegate,
        })
    }

    extern "C-unwind" fn signed_feed(
        _: *mut AnyObject,
        _: Sel,
        _: *mut AnyObject,
    ) -> *const NSString {
        FEED.with_borrow(|feed| feed.as_deref().map_or(ptr::null(), ptr::from_ref))
    }

    fn install_quit_guard(cx: &App, request_quit: fn(&mut App)) -> Option<()> {
        let application: Retained<AnyObject> =
            unsafe { msg_send![class!(NSApplication), sharedApplication] };
        let delegate: Retained<AnyObject> = unsafe {
            let delegate: Option<Retained<AnyObject>> = msg_send![&*application, delegate];
            delegate?
        };
        let delegate_class = delegate.class();
        let selector = sel!(applicationShouldTerminate:);
        // GPUI 0.2.2 has no termination decision delegate. If that changes, disable
        // updates until we can integrate with its quit callback without replacing it.
        let already_implemented: bool =
            unsafe { msg_send![&*delegate, respondsToSelector: selector] };
        if delegate_class.name().to_bytes() != b"GPUIApplicationDelegate" || already_implemented {
            return None;
        }
        let handler: extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> usize = should_terminate;
        // SAFETY: NSApplicationDelegate declares this method as an Objective-C
        // selector taking NSApplication and returning an NSUInteger-backed enum.
        let installed = unsafe {
            objc2::ffi::class_addMethod(
                ptr::from_ref(delegate_class).cast_mut(),
                selector,
                std::mem::transmute::<
                    extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> usize,
                    Imp,
                >(handler),
                c"Q@:@".as_ptr(),
            )
        };
        if !installed.as_bool() {
            return None;
        }
        QUIT_HANDLER.with_borrow_mut(|handler| *handler = Some((cx.to_async(), request_quit)));
        unsafe {
            // Refresh AppKit's cache of optional delegate selectors.
            let () = msg_send![&*application, setDelegate: ptr::null_mut::<AnyObject>()];
            let () = msg_send![&*application, setDelegate: &*delegate];
        }
        Some(())
    }

    extern "C-unwind" fn should_terminate(_: &AnyObject, _: Sel, _: &AnyObject) -> usize {
        if ALLOW_QUIT.replace(false) {
            return 1; // NSTerminateNow
        }
        if !QUIT_PENDING.replace(true) {
            QUIT_HANDLER.with_borrow(|handler| {
                if let Some((cx, request_quit)) = handler {
                    let request_quit = *request_quit;
                    cx.spawn(async move |cx| {
                        QUIT_PENDING.set(false);
                        let _ = cx.update(request_quit);
                    })
                    .detach();
                }
            });
        }
        0 // NSTerminateCancel
    }
}

#[cfg(all(test, target_os = "macos"))]
#[path = "../../../tests/native/updater.rs"]
mod tests;
